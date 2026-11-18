import { destroyHlsPlayer, handleHlsJsMediaError, startHlsPlayback } from 'components/playback/hlsPlayer';
import { enableHlsJsPlayerForCodecs } from 'lib/playback/hlsSupport';
import { VideoSubtitles } from 'components/playback/VideoSubtitles';
import { getMediaStreamAudioTracks, getSubtitleTimeOffset } from 'components/playback/videoTrackHelpers';
import type { BrowserDetection, PlayerOptions, PlayerProfile, PlayerStream } from 'types/legacyPlayer';

import Screenfull from 'screenfull';

import { AppFeature } from 'constants/appFeature';
import { PluginType } from 'constants/pluginType';
import { TICKS_PER_MILLISECOND, TICKS_PER_SECOND } from 'constants/time';
import { ServerConnections } from 'lib/jellyfin-apiclient';

import { MediaError } from 'types/mediaError';

import detectedBrowser from '../../scripts/browser';
import appSettings from '../../scripts/settings/appSettings';
import { appHost } from '../../components/apphost';
import loading from '../../components/loading/loading';
import { playbackManager } from '../../components/playback/playbackmanager';
import { appRouter } from '../../components/router/appRouter';
import { destroyFlvPlayer, destroyCastPlayer, getCrossOriginValue, applySrc, resetSrc, playWithPromise, onEndedInternal, saveVolume, seekOnPlaybackStart, onErrorInternal, getSavedVolume, isValidDuration, getBufferedRanges } from '../../components/htmlMediaHelper';

import globalize from '../../lib/globalize';
import profileBuilder, { canPlaySecondaryAudio } from '../../scripts/browserDeviceProfile';
import { getIncludeCorsCredentials } from '../../scripts/settings/webSettings';
import { setBackdropTransparency, TRANSPARENCY_LEVEL } from '../../components/backdrop/backdrop';
import Events from '../../utils/events';
import { includesAny } from '../../utils/container';
import { isHls } from '../../utils/mediaSource';

const browser = detectedBrowser as BrowserDetection;

function getDefaultProfile() {
    return profileBuilder({});
}

// The facade also types remote players, whose play options and empty-state
// return values differ. Facade casts below retain the local player's legacy API.
export class HtmlVideoPlayer extends VideoSubtitles {
    forcedFullscreen?: boolean;
    name = 'Html Video Player';

    type = PluginType.MediaPlayer;

    id = 'htmlvideoplayer';

    priority = 1;
    private videoVideoDialog: HTMLDivElement | null | undefined;
    private videoSubtitleTrackIndexToSetOnPlaying: number | undefined;
    private videoSecondarySubtitleTrackIndexToSetOnPlaying: number | undefined;
    private videoAudioTrackIndexToSetOnPlaying: number | null | undefined;
    private videoSupportedFeatures: string[] | undefined;
    protected videoMediaElement: HTMLVideoElement | null | undefined;
    private videoCurrentSrc: string | undefined;
    private videoStarted: boolean | undefined;
    private videoTimeUpdated: boolean | undefined;
    private videoCurrentTime: number | null | undefined;

    _hlsPlayer?: import('hls.js').default | null;
    _hlsRequest?: import('lib/playback/types/htmlMedia').MediaInstance['_hlsRequest'];
    _hlsRecovery?: import('lib/playback/types/htmlMedia').MediaInstance['_hlsRecovery'];

    _flvPlayer: import('lib/playback/types/htmlMedia').MediaInstance['_flvPlayer'] | undefined;

    _castPlayer: import('lib/playback/types/htmlMedia').MediaInstance['_castPlayer'];

    _currentPlayOptions!: PlayerOptions;
    private videoLastProfile: PlayerProfile | undefined;

    currentSrc() {
        return this.videoCurrentSrc;
    }

    updateVideoUrl(streamInfo: PlayerOptions) {
        const mediaSource = streamInfo.mediaSource;
        const item = streamInfo.item;

        // Huge hack alert. Safari doesn't seem to like if the segments aren't available right away when playback starts
        // This will start the transcoding process before actually feeding the video url into the player
        // Edit: Also seeing stalls from hls.js
        if (mediaSource && item && !mediaSource.RunTimeTicks && isHls(mediaSource) && streamInfo.playMethod === 'Transcode' && (browser.iOS || browser.osx)) {
            const hlsPlaylistUrl = streamInfo.url.replace('master.m3u8', 'live.m3u8');

            loading.show();

            console.debug(`prefetching hls playlist: ${hlsPlaylistUrl}`);

            return ServerConnections.getApiClient(item.ServerId)!.ajax({

                type: 'GET',
                url: hlsPlaylistUrl

            }).then(function () {
                console.debug(`completed prefetching hls playlist: ${hlsPlaylistUrl}`);

                loading.hide();
                streamInfo.url = hlsPlaylistUrl;
            }, function () {
                console.error(`error prefetching hls playlist: ${hlsPlaylistUrl}`);

                loading.hide();
            });
        } else {
            return Promise.resolve();
        }
    }

    async play(options: PlayerOptions) {
        this.videoStarted = false;
        this.videoTimeUpdated = false;

        this.videoCurrentTime = null;

        if (options.resetSubtitleOffset !== false) this.resetSubtitleOffset();

        if (appSettings.get('subtitlerenderpgs') === 'true') {
            void import('libbitsub')
                .then(({ warmup }) => warmup())
                .catch((error) => console.warn('[libbitsub] worker prewarm failed; renderer fallback will be used', error));
        }

        const elem = await this.createMediaElement(options);
        this.videoApplyAspectRatio(options.aspectRatio || this.getAspectRatio());

        await this.updateVideoUrl(options);
        return this.setCurrentSrc(elem, options);
    }

    setSrcWithFlvJs(elem: HTMLVideoElement, options: PlayerOptions, url: string) {
        return import('flv.js').then(({ default: flvjs }) => {
            const flvPlayer = flvjs.createPlayer({
                type: 'flv',
                url: url
            },
            {
                seekType: 'range',
                lazyLoad: false
            });

            flvPlayer.attachMediaElement(elem);
            flvPlayer.load();

            this._flvPlayer = flvPlayer;

            // This is needed in setCurrentTrackElement
            this.videoCurrentSrc = url;

            return flvPlayer.play();
        });
    }

    private setInitialPrimarySubtitle(options: PlayerOptions) {
        let secondaryTrackValid = true;

        this.videoSubtitleTrackIndexToSetOnPlaying = options.mediaSource.DefaultSubtitleStreamIndex == null ? -1 : options.mediaSource.DefaultSubtitleStreamIndex;
        if (this.videoSubtitleTrackIndexToSetOnPlaying != null && this.videoSubtitleTrackIndexToSetOnPlaying >= 0) {
            const initialSubtitleStream = options.mediaSource.MediaStreams[this.videoSubtitleTrackIndexToSetOnPlaying];
            if (!initialSubtitleStream || initialSubtitleStream.DeliveryMethod === 'Encode') {
                this.videoSubtitleTrackIndexToSetOnPlaying = -1;
                secondaryTrackValid = false;
            }
            // secondary track should not be shown if primary track is no longer a valid pair
            if (initialSubtitleStream && !playbackManager.trackHasSecondarySubtitleSupport(initialSubtitleStream, this as unknown as import('types/plugin').PlaybackPlayer)) {
                secondaryTrackValid = false;
            }
        } else {
            secondaryTrackValid = false;
        }

        return secondaryTrackValid;
    }

    private setInitialSecondarySubtitle(options: PlayerOptions, secondaryTrackValid: boolean) {
        if (secondaryTrackValid) {
            this.videoSecondarySubtitleTrackIndexToSetOnPlaying = options.mediaSource.DefaultSecondarySubtitleStreamIndex == null ? -1 : options.mediaSource.DefaultSecondarySubtitleStreamIndex;
            if (this.videoSecondarySubtitleTrackIndexToSetOnPlaying != null && this.videoSecondarySubtitleTrackIndexToSetOnPlaying >= 0) {
                const initialSecondarySubtitleStream = options.mediaSource.MediaStreams[this.videoSecondarySubtitleTrackIndexToSetOnPlaying];
                if (!initialSecondarySubtitleStream || !playbackManager.trackHasSecondarySubtitleSupport(initialSecondarySubtitleStream, this as unknown as import('types/plugin').PlaybackPlayer)) {
                    this.videoSecondarySubtitleTrackIndexToSetOnPlaying = -1;
                }
            }
        } else {
            this.videoSecondarySubtitleTrackIndexToSetOnPlaying = -1;
        }
    }

    async setCurrentSrc(elem: HTMLVideoElement, options: PlayerOptions) {
        elem.removeEventListener('error', this.onError);

        let val = options.url;
        console.debug(`playing url: ${val}`);

        // Convert to seconds
        const seconds = (options.playerStartPositionTicks || 0) / TICKS_PER_SECOND;
        if (seconds) {
            val += `#t=${seconds}`;
        }

        destroyHlsPlayer(this);
        destroyFlvPlayer(this);
        destroyCastPlayer(this);

        const secondaryTrackValid = this.setInitialPrimarySubtitle(options);

        this.videoAudioTrackIndexToSetOnPlaying = options.playMethod === 'Transcode' ? null : options.mediaSource.DefaultAudioStreamIndex;

        this._currentPlayOptions = options;

        this.setInitialSecondarySubtitle(options, secondaryTrackValid);

        const crossOrigin = getCrossOriginValue(options.mediaSource);
        if (crossOrigin) {
            elem.crossOrigin = crossOrigin;
        }

        if (enableHlsJsPlayerForCodecs(options.mediaSource, 'Video') && isHls(options.mediaSource)) {
            const highBitrate = (browser.chrome || browser.edgeChromium || browser.firefox)
                && playbackManager.getMaxStreamingBitrate(this as unknown as import('types/plugin').PlaybackPlayer) >= 25000000;
            const maxBufferLength = highBitrate ? 6 : 30;
            return startHlsPlayback(this, elem, val, this.onError, {
                startPosition: (options.playerStartPositionTicks || 0) / TICKS_PER_SECOND,
                maxBufferLength,
                maxMaxBufferLength: maxBufferLength,
                videoPreference: { preferHDR: true }
            }, () => { this.videoCurrentSrc = val; });
        } else if (options.playMethod !== 'Transcode' && options.mediaSource.Container?.toUpperCase() === 'FLV') {
            return this.setSrcWithFlvJs(elem, options, val);
        } else {
            elem.autoplay = true;

            const includeCorsCredentials = await getIncludeCorsCredentials();
            if (includeCorsCredentials) {
                // Safari will not send cookies without this
                elem.crossOrigin = 'use-credentials';
            }

            return applySrc(elem, val).then(() => {
                this.videoCurrentSrc = val;

                return playWithPromise(elem, this.onError);
            });
        }
    }

    isAudioStreamSupported(stream: PlayerStream, deviceProfile: PlayerProfile | undefined, container: string) {
        const codec = (stream.Codec || '').toLowerCase();

        if (!codec) {
            return true;
        }

        if (!deviceProfile) {
            // This should never happen
            return true;
        }

        const profiles = deviceProfile.DirectPlayProfiles || [];

        return profiles.some(function (p) {
            return p.Type === 'Video'
                    && includesAny((p.Container || '').toLowerCase(), container)
                    && includesAny((p.AudioCodec || '').toLowerCase(), codec);
        });
    }

    getSupportedAudioStreams() {
        const profile = this.videoLastProfile;

        const mediaSource = this._currentPlayOptions.mediaSource;
        const container = mediaSource.Container!.toLowerCase();

        return getMediaStreamAudioTracks(mediaSource).filter((stream) => {
            return this.isAudioStreamSupported(stream, profile, container);
        });
    }

    setAudioStreamIndex(index: number) {
        const streams = this.getSupportedAudioStreams();

        if (streams.length < 2) {
            // If there's only one supported stream then trust that the player will handle it on it's own
            return;
        }

        let audioIndex = -1;

        for (const stream of streams) {
            audioIndex++;

            if (stream.Index === index) {
                break;
            }
        }

        if (audioIndex === -1) {
            return;
        }

        const elem = this.videoMediaElement;
        if (!elem) {
            return;
        }

        // https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/audioTracks

        const elemAudioTracks = elem.audioTracks || [];
        console.debug(`found ${elemAudioTracks.length} audio tracks`);

        for (const [i, audioTrack] of Array.from(elemAudioTracks).entries()) {
            if (audioIndex === i) {
                console.debug(`setting audio track ${i} to enabled`);
                audioTrack.enabled = true;
            } else {
                console.debug(`setting audio track ${i} to disabled`);
                audioTrack.enabled = false;
            }
        }
    }

    stop(destroyPlayer?: boolean) {
        const elem = this.videoMediaElement;
        const src = this.videoCurrentSrc;

        if (elem) {
            if (src) {
                elem.pause();
            }

            onEndedInternal(this, elem, this.onError);
        }

        this.destroyCustomTrack(elem);

        if (destroyPlayer) {
            this.destroy();
        }

        return Promise.resolve();
    }

    destroy() {
        this.setSubtitleOffset.cancel();

        destroyHlsPlayer(this);
        destroyFlvPlayer(this);

        setBackdropTransparency(TRANSPARENCY_LEVEL.None);
        document.body.classList.remove('hide-scroll');

        const videoElement = this.videoMediaElement;

        if (videoElement) {
            this.videoMediaElement = null;

            this.destroyCustomTrack(videoElement);
            videoElement.removeEventListener('timeupdate', this.onTimeUpdate);
            videoElement.removeEventListener('ended', this.onEnded);
            videoElement.removeEventListener('volumechange', this.onVolumeChange);
            videoElement.removeEventListener('pause', this.onPause);
            videoElement.removeEventListener('playing', this.onPlaying);
            videoElement.removeEventListener('play', this.onPlay);
            videoElement.removeEventListener('click', this.onClick);
            videoElement.removeEventListener('dblclick', this.onDblClick);
            videoElement.removeEventListener('waiting', this.onWaiting);
            videoElement.removeEventListener('error', this.onError); // bound in htmlMediaHelper

            resetSrc(videoElement);

            videoElement.parentNode!.removeChild(videoElement);
        }

        const dlg = this.videoVideoDialog;
        if (dlg) {
            this.videoVideoDialog = null;
            dlg.parentNode!.removeChild(dlg);
        }

        if (Screenfull.isEnabled) {
            void Screenfull.exit();
        } else if (document.webkitIsFullScreen && document.webkitCancelFullscreen) {
            // iOS Safari
            document.webkitCancelFullscreen();
        }
    }

    onEnded = (e: Event) => {
        const elem = e.target as HTMLVideoElement;
        this.destroyCustomTrack(elem);
        onEndedInternal(this, elem, this.onError);
    };

    onTimeUpdate = (e: Event) => {
        const elem = e.target as HTMLVideoElement;
        // get the player position and the transcoding offset
        const time = elem.currentTime;

        if (time && !this.videoTimeUpdated) {
            this.videoTimeUpdated = true;
            this.ensureValidVideo(elem);
        }

        this.videoCurrentTime = time;

        const currentPlayOptions = this._currentPlayOptions;
        // Not sure yet how this is coming up null since we never null it out, but it is causing app crashes
        if (currentPlayOptions) {
            let timeMs = time * 1000;
            timeMs += ((currentPlayOptions.transcodingOffsetTicks || 0) / TICKS_PER_MILLISECOND);
            this.updateSubtitleText(timeMs);
        }

        Events.trigger(this, 'timeupdate');
    };

    onVolumeChange = (e: Event) => {
        const elem = e.target as HTMLVideoElement;
        saveVolume(elem.volume);
        Events.trigger(this, 'volumechange');
    };

    onNavigatedToOsd = () => {
        const dlg = this.videoVideoDialog;
        if (dlg) {
            dlg.classList.remove('videoPlayerContainer-onTop');

            this.onStartedAndNavigatedToOsd();
        }
    };

    onStartedAndNavigatedToOsd() {
        // If this causes a failure during navigation we end up in an awkward UI state
        this.setCurrentTrackElement(this.videoSubtitleTrackIndexToSetOnPlaying);

        if (this.videoAudioTrackIndexToSetOnPlaying != null && this.canSetAudioStreamIndex()) {
            this.setAudioStreamIndex(this.videoAudioTrackIndexToSetOnPlaying);
        }

        if (this.videoSecondarySubtitleTrackIndexToSetOnPlaying != null && this.videoSecondarySubtitleTrackIndexToSetOnPlaying >= 0) {
            setTimeout(() => this.setSecondarySubtitleStreamIndex(this.videoSecondarySubtitleTrackIndexToSetOnPlaying!), 0);
        }
    }

    onPlaying = (e: Event) => {
        const elem = e.target as HTMLVideoElement;
        if (!this.videoStarted) {
            this.videoStarted = true;
            elem.removeAttribute('controls');

            loading.hide();

            seekOnPlaybackStart(this, elem, this._currentPlayOptions.playerStartPositionTicks, () => {
                if (this.videoCurrentAssRenderer) {
                    this.videoCurrentAssRenderer.timeOffset = getSubtitleTimeOffset(this._currentPlayOptions, this.videoCurrentTrackOffset);
                    this.videoCurrentAssRenderer.resize();
                    this.videoCurrentAssRenderer.resetRenderAheadCache(false);
                }

                if (this.videoCurrentBitmapSubRenderer) {
                    this.videoCurrentBitmapSubRenderer.timeOffset = getSubtitleTimeOffset(this._currentPlayOptions, this.videoCurrentTrackOffset);
                    this.videoCurrentBitmapSubRenderer.updateCanvasSize?.();
                }
            });

            if (this._currentPlayOptions.fullscreen) {
                void appRouter.showVideoOsd().then(this.onNavigatedToOsd);
            } else {
                setBackdropTransparency(TRANSPARENCY_LEVEL.Backdrop);
                this.videoVideoDialog!.classList.remove('videoPlayerContainer-onTop');

                this.onStartedAndNavigatedToOsd();
            }
        }
        Events.trigger(this, 'playing');
    };

    onPlay = () => {
        Events.trigger(this, 'unpause');
    };

    ensureValidVideo(elem: HTMLVideoElement) {
        if (elem !== this.videoMediaElement) {
            return;
        }

        if (elem.videoWidth === 0 && elem.videoHeight === 0) {
            const mediaSource = this._currentPlayOptions?.mediaSource;

            // Only trigger this if there is media info
            // Avoid triggering in situations where it might not actually have a video stream (audio only live tv channel)
            if (!mediaSource || mediaSource.RunTimeTicks) {
                onErrorInternal(this, MediaError.NO_MEDIA_ERROR);
            }
        }
    }

    onClick = () => {
        Events.trigger(this, 'click');
    };

    onDblClick = () => {
        Events.trigger(this, 'dblclick');
    };

    onPause = () => {
        Events.trigger(this, 'pause');
    };

    onWaiting = () => {
        Events.trigger(this, 'waiting');
    };

    onError = (e: Event) => {
        const elem = e.target as HTMLVideoElement;
        const errorCode = elem.error ? (elem.error.code || 0) : 0;
        const errorMessage = elem.error ? (elem.error.message || '') : '';
        console.error(`media element error: ${errorCode} ${errorMessage}`);

        let type;

        switch (errorCode) {
            case 1:
                // MEDIA_ERR_ABORTED
                // This will trigger when changing media while something is playing
                return;
            case 2:
                // MEDIA_ERR_NETWORK
                type = MediaError.NETWORK_ERROR;
                break;
            case 3:
                // MEDIA_ERR_DECODE
                if (this._hlsPlayer) {
                    handleHlsJsMediaError(this);
                    return;
                }
                type = MediaError.MEDIA_DECODE_ERROR;
                break;
            case 4:
                // MEDIA_ERR_SRC_NOT_SUPPORTED
                type = MediaError.MEDIA_NOT_SUPPORTED;
                break;
            default:
                // seeing cases where Edge is firing error events with no error code
                // example is start playing something, then immediately change src to something else
                return;
        }

        onErrorInternal(this, type);
    };

    createMediaElement(options: PlayerOptions) {
        const dlg = document.querySelector('.videoPlayerContainer');

        if (!dlg) {
            return import('./style.scss').then(() => {
                if (options.fullscreen) loading.show();

                const playerDlg = document.createElement('div');
                playerDlg.setAttribute('dir', 'ltr');
                playerDlg.classList.add('videoPlayerContainer');
                if (options.fullscreen) {
                    playerDlg.classList.add('videoPlayerContainer-onTop');
                }

                let html = '';
                const cssClass = 'htmlvideoplayer';

                // Can't autoplay in these browsers so we need to use the full controls, at least until playback starts
                if (!appHost.supports(AppFeature.HtmlVideoAutoplay)) {
                    html += '<video class="' + cssClass + '" preload="metadata" autoplay="autoplay" controls="controls" webkit-playsinline playsinline>';
                } else if (browser.web0s) {
                    // in webOS, setting preload auto allows resuming videos
                    html += '<video class="' + cssClass + '" preload="auto" autoplay="autoplay" webkit-playsinline playsinline>';
                } else {
                    // Chrome 35 won't play with preload none
                    html += '<video class="' + cssClass + '" preload="metadata" autoplay="autoplay" webkit-playsinline playsinline>';
                }

                html += '</video>';

                playerDlg.innerHTML = html;
                const videoElement = playerDlg.querySelector('video')!;

                // TODO: Move volume control to PlaybackManager. Player should just be a wrapper that translates commands into API calls.
                if (!appHost.supports(AppFeature.PhysicalVolumeControl)) {
                    videoElement.volume = getSavedVolume();
                }

                videoElement.addEventListener('timeupdate', this.onTimeUpdate);
                videoElement.addEventListener('ended', this.onEnded);
                videoElement.addEventListener('volumechange', this.onVolumeChange);
                videoElement.addEventListener('pause', this.onPause);
                videoElement.addEventListener('playing', this.onPlaying);
                videoElement.addEventListener('play', this.onPlay);
                videoElement.addEventListener('click', this.onClick);
                videoElement.addEventListener('dblclick', this.onDblClick);
                videoElement.addEventListener('waiting', this.onWaiting);
                if (options.backdropUrl) {
                    videoElement.poster = options.backdropUrl;
                }

                document.body.insertBefore(playerDlg, document.body.firstChild);
                this.videoVideoDialog = playerDlg;
                this.videoMediaElement = videoElement;

                delete this.forcedFullscreen;

                if (options.fullscreen) {
                    // At this point, we must hide the scrollbar placeholder, so it's not being displayed while the item is being loaded
                    document.body.classList.add('hide-scroll');

                    // Enter fullscreen in the webOS browser to hide the top bar
                    if (!window.NativeShell && browser.web0s && Screenfull.isEnabled) {
                        void Screenfull.request().then(() => {
                            this.forcedFullscreen = true;
                        });
                        return videoElement;
                    }
                }

                return videoElement;
            });
        } else {
            if (options.fullscreen) {
                // we need to hide scrollbar when starting playback from page with animated background
                document.body.classList.add('hide-scroll');

                // Enter fullscreen in the webOS browser to hide the top bar
                if (!this.forcedFullscreen && !window.NativeShell && browser.web0s && Screenfull.isEnabled) {
                    void Screenfull.request().then(() => {
                        this.forcedFullscreen = true;
                    });
                }
            }

            const videoElement = dlg.querySelector('video')!;
            if (options.backdropUrl) {
                // update backdrop image
                videoElement.poster = options.backdropUrl;
            }

            return Promise.resolve(videoElement);
        }
    }

    canPlayMediaType(mediaType?: string | null) {
        return (mediaType || '').toLowerCase() === 'video';
    }

    supportsPlayMethod(playMethod: string, item: PlayerOptions['item']) {
        const host = appHost as typeof appHost & { supportsPlayMethod?: (method: string, item: PlayerOptions['item']) => boolean };
        if (host.supportsPlayMethod) {
            return host.supportsPlayMethod(playMethod, item);
        }

        return true;
    }

    getDeviceProfile(item?: PlayerOptions['item'] | null, options?: { isRetry?: boolean }) {
        return HtmlVideoPlayer.getDeviceProfileInternal(item, options).then((profile) => {
            this.videoLastProfile = profile;
            return profile;
        });
    }

    static getDeviceProfileInternal(item?: PlayerOptions['item'] | null, options?: { isRetry?: boolean }) {
        if (appHost.getDeviceProfile) {
            return appHost.getDeviceProfile(item, options);
        }

        // Keep the legacy fallback value; appHost supplies the promise path in this build.
        return getDefaultProfile() as unknown as Promise<PlayerProfile>;
    }

    static getSupportedFeatures() {
        const list = [];

        const video = document.createElement('video');
        if (
            // Check non-standard Safari PiP support
            typeof video.webkitSupportsPresentationMode === 'function' && video.webkitSupportsPresentationMode('picture-in-picture') && typeof video.webkitSetPresentationMode === 'function'
            // Check standard PiP support
            || document.pictureInPictureEnabled
        ) {
            list.push('PictureInPicture');
        }

        if (browser.safari || browser.iOS || browser.iPad) {
            list.push('AirPlay');
        }

        if (typeof video.playbackRate === 'number') {
            list.push('PlaybackRate');
        }

        list.push('SetBrightness');
        list.push('SetAspectRatio');
        list.push('SecondarySubtitles');

        return list;
    }

    supports(feature: string) {
        if (!this.videoSupportedFeatures) {
            this.videoSupportedFeatures = HtmlVideoPlayer.getSupportedFeatures();
        }

        return this.videoSupportedFeatures.includes(feature);
    }

    // Save this for when playback stops, because querying the time at that point might return 0
    currentTime(val?: number) {
        const mediaElement = this.videoMediaElement;
        if (mediaElement) {
            if (val != null) {
                mediaElement.currentTime = val / 1000;
                return;
            }

            const currentTime = this.videoCurrentTime;
            if (currentTime) {
                return currentTime * 1000;
            }

            return (mediaElement.currentTime || 0) * 1000;
        }
    }

    duration() {
        const mediaElement = this.videoMediaElement;
        if (mediaElement) {
            const duration = mediaElement.duration;
            if (isValidDuration(duration)) {
                return duration * 1000;
            }
        }

        return null;
    }

    canSetAudioStreamIndex() {
        const video = this.videoMediaElement;
        if (video) {
            return canPlaySecondaryAudio(video);
        }

        return false;
    }

    static onPictureInPictureError(err: unknown) {
        console.error(`Picture in picture error: ${err}`);
    }

    setPictureInPictureEnabled(isEnabled: boolean) {
        const video = this.videoMediaElement;

        if (document.pictureInPictureEnabled) {
            if (video) {
                if (isEnabled) {
                    video.requestPictureInPicture().catch(HtmlVideoPlayer.onPictureInPictureError);
                } else {
                    document.exitPictureInPicture().catch(HtmlVideoPlayer.onPictureInPictureError);
                }
            }
        } else if (video?.webkitSupportsPresentationMode && typeof video.webkitSetPresentationMode === 'function') {
            video.webkitSetPresentationMode(isEnabled ? 'picture-in-picture' : 'inline');
        }
    }

    isPictureInPictureEnabled() {
        if (document.pictureInPictureEnabled) {
            return !!document.pictureInPictureElement;
        } else {
            const video = this.videoMediaElement;
            if (video) {
                return video.webkitPresentationMode === 'picture-in-picture';
            }
        }

        return false;
    }

    isAirPlayEnabled() {
        if (document.AirPlayEnabled) {
            return !!document.AirplayElement;
        }

        return false;
    }

    setAirPlayEnabled(isEnabled: boolean) {
        const video = this.videoMediaElement;

        if (document.AirPlayEnabled) {
            if (video) {
                if (isEnabled) {
                    video.requestAirPlay().catch(function(err) {
                        console.error('Error requesting AirPlay', err);
                    });
                } else {
                    document.exitAirPLay().catch(function(err) {
                        console.error('Error exiting AirPlay', err);
                    });
                }
            }
        } else {
            video!.webkitShowPlaybackTargetPicker();
        }
    }

    setBrightness(val: number) {
        const elem = this.videoMediaElement;

        if (elem) {
            val = Math.max(0, val);
            val = Math.min(100, val);

            let rawValue = val;
            rawValue = Math.max(20, rawValue);

            const cssValue = rawValue >= 100 ? 'none' : (rawValue / 100);
            elem.style['-webkit-filter'] = `brightness(${cssValue})`;
            elem.style.filter = `brightness(${cssValue})`;
            elem.brightnessValue = val;
            Events.trigger(this, 'brightnesschange');
        }
    }

    getBrightness() {
        const elem = this.videoMediaElement;
        if (elem) {
            const val = elem.brightnessValue;
            return val == null ? 100 : val;
        }
    }

    seekable() {
        const mediaElement = this.videoMediaElement;
        if (mediaElement) {
            const seekable = mediaElement.seekable;
            if (seekable?.length) {
                let start = seekable.start(0);
                let end = seekable.end(0);

                if (!isValidDuration(start)) {
                    start = 0;
                }
                if (!isValidDuration(end)) {
                    end = 0;
                }

                return (end - start) > 0;
            }

            return false;
        }
    }

    pause() {
        const mediaElement = this.videoMediaElement;
        if (mediaElement) {
            mediaElement.pause();
        }
    }

    // This is a retry after error
    resume() {
        this.unpause();
    }

    unpause() {
        const mediaElement = this.videoMediaElement;
        if (mediaElement) {
            void mediaElement.play();
        }
    }

    paused() {
        const mediaElement = this.videoMediaElement;
        if (mediaElement) {
            return mediaElement.paused;
        }

        return false;
    }

    setPlaybackRate(value: number) {
        const mediaElement = this.videoMediaElement;
        if (mediaElement) {
            mediaElement.playbackRate = value;
        }
    }

    getPlaybackRate() {
        const mediaElement = this.videoMediaElement;
        if (mediaElement) {
            return mediaElement.playbackRate;
        }
        return null;
    }

    getSupportedPlaybackRates() {
        return [{
            name: '0.5x',
            id: 0.5
        }, {
            name: '0.75x',
            id: 0.75
        }, {
            name: '1x',
            id: 1.0
        }, {
            name: '1.25x',
            id: 1.25
        }, {
            name: '1.5x',
            id: 1.5
        }, {
            name: '1.75x',
            id: 1.75
        }, {
            name: '2x',
            id: 2.0
        }, {
            name: '2.5x',
            id: 2.5
        }, {
            name: '3x',
            id: 3.0
        }, {
            name: '3.5x',
            id: 3.5
        }, {
            name: '4.0x',
            id: 4.0
        }];
    }

    setVolume(val: number) {
        const mediaElement = this.videoMediaElement;
        if (mediaElement) {
            mediaElement.volume = Math.pow(val / 100, 3);
        }
    }

    getVolume() {
        const mediaElement = this.videoMediaElement;
        if (mediaElement) {
            return Math.min(Math.round(Math.pow(mediaElement.volume, 1 / 3) * 100), 100);
        }
    }

    volumeUp() {
        this.setVolume(Math.min(this.getVolume()! + 2, 100));
    }

    volumeDown() {
        this.setVolume(Math.max(this.getVolume()! - 2, 0));
    }

    setMute(mute: boolean) {
        const mediaElement = this.videoMediaElement;
        if (mediaElement) {
            mediaElement.muted = mute;
        }
    }

    isMuted() {
        const mediaElement = this.videoMediaElement;
        if (mediaElement) {
            return mediaElement.muted;
        }
        return false;
    }

    private videoApplyAspectRatio(val = this.getAspectRatio()) {
        const mediaElement = this.videoMediaElement;
        if (mediaElement) {
            if (val === 'auto') {
                mediaElement.style.removeProperty('object-fit');
            } else {
                mediaElement.style['object-fit'] = val;
            }
        }

        if (this.videoCurrentBitmapSubRenderer) {
            this.videoCurrentBitmapSubRenderer.updateCanvasSize?.();
        }
    }

    setAspectRatio(val: string) {
        appSettings.aspectRatio(val);
        this.videoApplyAspectRatio(val);
    }

    getAspectRatio() {
        return appSettings.aspectRatio() || 'auto';
    }

    getSupportedAspectRatios() {
        return [{
            name: globalize.translate('Auto'),
            id: 'auto'
        }, {
            name: globalize.translate('AspectRatioCover'),
            id: 'cover'
        }, {
            name: globalize.translate('AspectRatioFill'),
            id: 'fill'
        }];
    }

    togglePictureInPicture() {
        return this.setPictureInPictureEnabled(!this.isPictureInPictureEnabled());
    }

    toggleAirPlay() {
        return this.setAirPlayEnabled(!this.isAirPlayEnabled());
    }

    getBufferedRanges() {
        const mediaElement = this.videoMediaElement;
        if (mediaElement) {
            return getBufferedRanges(this, mediaElement);
        }

        return [];
    }

    getStats() {
        const mediaElement = this.videoMediaElement;
        const playOptions = this._currentPlayOptions || {};

        const categories: { type: string; stats: { label: string; value: string }[] }[] = [];

        if (!mediaElement) {
            return Promise.resolve({
                categories: categories
            });
        }

        const mediaCategory = {
            stats: [] as { label: string; value: string }[],
            type: 'media'
        };
        categories.push(mediaCategory);

        const mediaInfos = [];
        mediaInfos.push(this._hlsPlayer ? 'HLS' : 'Video');
        if (playOptions.url) {
            //  create an anchor element (note: no need to append this element to the document)
            let link: HTMLAnchorElement | null = document.createElement('a');
            //  set href to any path
            link.setAttribute('href', playOptions.url);
            const protocol = (link.protocol || '').replace(':', '');

            if (protocol) {
                mediaInfos.push(`(${protocol})`);
            }

            link = null;
        }
        if (mediaInfos.length) {
            mediaCategory.stats.push({
                label: globalize.translate('LabelStreamType'),
                value: mediaInfos.join('  ')
            });
        }

        const videoCategory = {
            stats: [] as { label: string; value: string }[],
            type: 'video'
        };
        categories.push(videoCategory);

        const devicePixelRatio = window.devicePixelRatio || 1;
        const rect = mediaElement.getBoundingClientRect ? mediaElement.getBoundingClientRect() : { width: NaN, height: NaN };
        let height = Math.round(rect.height * devicePixelRatio);
        let width = Math.round(rect.width * devicePixelRatio);

        const viewInfos = [];
        // Don't show player dimensions on smart TVs because the app UI could be lower
        // resolution than the video and this causes users to think there is a problem
        if (width && height && !browser.tv) {
            viewInfos.push(`${width}x${height}`);
        }

        height = mediaElement.videoHeight;
        width = mediaElement.videoWidth;
        if (width && height) {
            viewInfos.push(`${width}x${height}`);
        }
        if (viewInfos.length) {
            videoCategory.stats.push({
                label: globalize.translate('LabelPlayerSizes'),
                value: viewInfos.join(' / ')
            });
        }

        if (mediaElement.getVideoPlaybackQuality) {
            const playbackQuality = mediaElement.getVideoPlaybackQuality();
            const droppedVideoFrames = playbackQuality.droppedVideoFrames || 0;
            const corruptedVideoFrames = playbackQuality.corruptedVideoFrames || 0;

            const qualityInfos = [];
            qualityInfos.push(droppedVideoFrames);
            qualityInfos.push(corruptedVideoFrames);

            videoCategory.stats.push({
                label: globalize.translate('LabelPlaybackQuality'),
                value: qualityInfos.join(' / ')
            });
        }

        const audioCategory = {
            stats: [] as { label: string; value: string }[],
            type: 'audio'
        };
        categories.push(audioCategory);

        const sinkId = mediaElement.sinkId;
        if (sinkId) {
            audioCategory.stats.push({
                label: 'Sink Id:',
                value: sinkId
            });
        }

        return Promise.resolve({
            categories: categories
        });
    }
}

export default HtmlVideoPlayer;
