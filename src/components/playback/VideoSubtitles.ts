import { resolveUrl, tryRemoveElement, enableNativeTrackSupport, getMediaStreamVideoTracks, getMediaStreamTextTracks, normalizeTrackEventText, getTextTrackUrl, getSubtitleFileNameHint, getBitmapSubtitleDisplaySettings, getSubtitleTimeOffset, ASS_SUBTITLE_CODECS, VOBSUB_SUBTITLE_CODECS } from 'components/playback/videoTrackHelpers';
import type { BrowserDetection, PlayerOptions, PlayerStream } from 'types/legacyPlayer';
import DOMPurify from 'dompurify';
import debounce from 'lodash-es/debounce';

import { useCustomSubtitles } from 'lib/playback/utils/subtitleStyles';
import subtitleAppearanceHelper from 'components/subtitlesettings/subtitleappearancehelper';

import { TICKS_PER_MILLISECOND, TICKS_PER_SECOND } from 'constants/time';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { currentSettings as userSettings } from 'scripts/settings/userSettings';
import { MediaError } from 'types/mediaError';

import detectedBrowser from '../../scripts/browser';
import appSettings from '../../scripts/settings/appSettings';

import { appRouter } from '../../components/router/appRouter';
import { onErrorInternal } from '../../components/htmlMediaHelper';
import itemHelper from '../../components/itemHelper';

import Events from '../../utils/events';

import type { BitmapSubtitleRenderer } from '../../plugins/htmlVideoPlayer/subtitleTypes';

import { requestSubtitleData, type SubtitleData } from '../../plugins/htmlVideoPlayer/subtitleRequest';

const browser = detectedBrowser as BrowserDetection;

const PRIMARY_TEXT_TRACK_INDEX = 0;
const SECONDARY_TEXT_TRACK_INDEX = 1;
const VOBSUB_DEBAND_THRESHOLD = 64;
const VOBSUB_DEBAND_RANGE = 15;

export abstract class VideoSubtitles {
    abstract id: string;
    protected abstract videoMediaElement: HTMLVideoElement | null | undefined;
    abstract _currentPlayOptions: PlayerOptions;
    isFetching = false;

    protected videoCurrentAssRenderer: import('@jellyfin/libass-wasm').default | null | undefined;

    protected videoCurrentBitmapSubRenderer: BitmapSubtitleRenderer | null | undefined;

    protected videoCustomTrackIndex: number | undefined;

    protected videoCustomSecondaryTrackIndex: number | undefined;

    protected videoShowTrackOffset: boolean | undefined;

    protected videoCurrentTrackOffset: number | undefined;

    protected videoSecondaryTrackOffset: number | null | undefined;

    protected videoVideoSubtitlesElem: HTMLElement | null | undefined;

    protected videoVideoSecondarySubtitlesElem: HTMLElement | null | undefined;

    protected videoCurrentTrackEvents: SubtitleData['TrackEvents'] | null | undefined;

    protected videoCurrentSecondaryTrackEvents: SubtitleData['TrackEvents'] | null | undefined;

    protected videoRenderedSubtitleEvents = new WeakMap<HTMLElement, SubtitleData['TrackEvents'][number] | undefined>();

    protected videoFetchQueue = 0;

    protected videoPendingSubtitleLoads = new Map<number, { token: symbol; active: boolean }>();

    incrementFetchQueue() {
        if (this.videoFetchQueue <= 0) {
            this.isFetching = true;
            Events.trigger(this, 'beginFetch');
        }

        this.videoFetchQueue++;
    }

    decrementFetchQueue() {
        this.videoFetchQueue--;

        if (this.videoFetchQueue <= 0) {
            this.isFetching = false;
            Events.trigger(this, 'endFetch');
        }
    }

    beginPendingSubtitleLoad(targetTextTrackIndex: number, loadToken: symbol) {
        const pendingLoad = this.videoPendingSubtitleLoads.get(targetTextTrackIndex);
        if (!pendingLoad || pendingLoad.token !== loadToken || pendingLoad.active) {
            return;
        }

        pendingLoad.active = true;
        this.incrementFetchQueue();
    }

    endPendingSubtitleLoad(targetTextTrackIndex: number, loadToken?: symbol) {
        const pendingLoad = this.videoPendingSubtitleLoads.get(targetTextTrackIndex);
        if (!pendingLoad || (loadToken && pendingLoad.token !== loadToken)) {
            return;
        }

        this.videoPendingSubtitleLoads.delete(targetTextTrackIndex);
        if (pendingLoad.active) {
            this.decrementFetchQueue();
        }
    }

    createBitmapSubtitleRendererOptions(videoElement: HTMLVideoElement, track: PlayerStream, item: PlayerOptions['item'], targetTextTrackIndex: number): import('libbitsub').VideoSubtitleOptions {
        const loadToken = Symbol(String(targetTextTrackIndex));
        const displaySettings = getBitmapSubtitleDisplaySettings();
        this.endPendingSubtitleLoad(targetTextTrackIndex);
        this.videoPendingSubtitleLoads.set(targetTextTrackIndex, {
            token: loadToken,
            active: false
        });

        return {
            video: videoElement,
            subUrl: getTextTrackUrl(track, item),
            timeOffset: getSubtitleTimeOffset(this._currentPlayOptions, this.videoCurrentTrackOffset),
            streamingLoad: true,
            rangeRequests: true,
            prefetchWindow: { before: 1, after: 2 },
            ...(displaySettings ? { displaySettings } : {}),
            onLoading: () => this.beginPendingSubtitleLoad(targetTextTrackIndex, loadToken),
            onLoaded: () => this.endPendingSubtitleLoad(targetTextTrackIndex, loadToken),
            onError: () => this.endPendingSubtitleLoad(targetTextTrackIndex, loadToken)
        };
    }

    setSubtitleStreamIndex(index: number) {
        this.setCurrentTrackElement(index);
    }

    setSecondarySubtitleStreamIndex(index: number) {
        this.setCurrentTrackElement(index, SECONDARY_TEXT_TRACK_INDEX);
    }

    resetSubtitleOffset() {
        this.videoCurrentTrackOffset = 0;
        this.videoSecondaryTrackOffset = 0;
        this.videoShowTrackOffset = false;
    }

    enableShowingSubtitleOffset() {
        this.videoShowTrackOffset = true;
    }

    disableShowingSubtitleOffset() {
        this.videoShowTrackOffset = false;
    }

    isShowingSubtitleOffsetEnabled() {
        return this.videoShowTrackOffset;
    }

    getTextTracks() {
        const videoElement = this.videoMediaElement;
        if (videoElement) {
            return Array.from(videoElement.textTracks)
                .filter(function (trackElement) {
                    // get showing .vtt textTack
                    return trackElement.mode === 'showing';
                });
        } else {
            return null;
        }
    }

    setSubtitleOffset = debounce(this._setSubtitleOffset, 100);

    _setSubtitleOffset(offset: string | number) {
        const offsetValue = parseFloat(String(offset));

        // if .ass currently rendering
        if (this.videoCurrentAssRenderer) {
            this.updateCurrentTrackOffset(offsetValue);
            this.videoCurrentAssRenderer.timeOffset = getSubtitleTimeOffset(this._currentPlayOptions, offsetValue);
        } else if (this.videoCurrentBitmapSubRenderer) {
            this.updateCurrentTrackOffset(offsetValue);
            this.videoCurrentBitmapSubRenderer.timeOffset = getSubtitleTimeOffset(this._currentPlayOptions, offsetValue);
        } else {
            const trackElements = this.getTextTracks();
            // if .vtt currently rendering
            if (trackElements && trackElements.length > 0) {
                trackElements.forEach((trackElement, index) => {
                    this.setTextTrackSubtitleOffset(trackElement, offsetValue, index);
                });
            } else if (this.videoCurrentTrackEvents || this.videoCurrentSecondaryTrackEvents) {
                this.videoCurrentTrackEvents && this.setTrackEventsSubtitleOffset(this.videoCurrentTrackEvents, offsetValue, PRIMARY_TEXT_TRACK_INDEX);
                this.videoCurrentSecondaryTrackEvents && this.setTrackEventsSubtitleOffset(this.videoCurrentSecondaryTrackEvents, offsetValue, SECONDARY_TEXT_TRACK_INDEX);
            } else {
                this.updateCurrentTrackOffset(offsetValue);
                console.debug('No available track, cannot apply offset: ', offsetValue);
            }
        }
    }

    updateCurrentTrackOffset(offsetValue: number, currentTrackIndex = PRIMARY_TEXT_TRACK_INDEX) {
        let offsetToCompare: number | null | undefined = this.videoCurrentTrackOffset;
        if (this.isSecondaryTrack(currentTrackIndex)) {
            offsetToCompare = this.videoSecondaryTrackOffset;
        }

        let relativeOffset = offsetValue;
        const newTrackOffset = offsetValue;

        if (offsetToCompare) {
            relativeOffset -= offsetToCompare;
        }

        if (this.isSecondaryTrack(currentTrackIndex)) {
            this.videoSecondaryTrackOffset = newTrackOffset;
        } else {
            this.videoCurrentTrackOffset = newTrackOffset;
        }

        // relative to currentTrackOffset
        return relativeOffset;
    }

    requiresHidingActiveCuesOnOffsetChange() {
        return !!browser.firefox;
    }

    hideTextTrackWithActiveCues(currentTrack: TextTrack) {
        if (currentTrack.activeCues) {
            currentTrack.mode = 'hidden';
        }
    }

    forceClearTextTrackActiveCues(currentTrack: TextTrack) {
        if (currentTrack.activeCues) {
            currentTrack.mode = 'disabled';
            setTimeout(() => {
                currentTrack.mode = 'showing';
            }, 0);
        }
    }

    setTextTrackSubtitleOffset(currentTrack: TextTrack, offsetValue: number, currentTrackIndex: number) {
        if (currentTrack.cues) {
            offsetValue = this.updateCurrentTrackOffset(offsetValue, currentTrackIndex);
            if (offsetValue === 0) {
                return;
            }

            const shouldClearActiveCues = this.requiresHidingActiveCuesOnOffsetChange();
            if (shouldClearActiveCues) {
                this.hideTextTrackWithActiveCues(currentTrack);
            }

            Array.from(currentTrack.cues)
                .forEach(function (cue) {
                    cue.startTime -= offsetValue;
                    cue.endTime -= offsetValue;
                });

            if (shouldClearActiveCues) {
                this.forceClearTextTrackActiveCues(currentTrack);
            }
        }
    }

    setTrackEventsSubtitleOffset(trackEvents: SubtitleData['TrackEvents'] | null | undefined, offsetValue: number, currentTrackIndex: number) {
        if (Array.isArray(trackEvents)) {
            offsetValue = this.updateCurrentTrackOffset(offsetValue, currentTrackIndex) * TICKS_PER_SECOND; // ticks
            if (offsetValue === 0) {
                return;
            }
            trackEvents.forEach(function (trackEvent) {
                trackEvent.StartPositionTicks -= offsetValue;
                trackEvent.EndPositionTicks -= offsetValue;
            });
        }
    }

    getSubtitleOffset() {
        return this.videoCurrentTrackOffset;
    }

    isPrimaryTrack(textTrackIndex?: number) {
        return textTrackIndex === PRIMARY_TEXT_TRACK_INDEX;
    }

    isSecondaryTrack(textTrackIndex?: number) {
        return textTrackIndex === SECONDARY_TEXT_TRACK_INDEX;
    }

    destroyCustomRenderedTrackElements(targetTrackIndex?: number) {
        if (this.isPrimaryTrack(targetTrackIndex)) {
            if (this.videoVideoSubtitlesElem) {
                tryRemoveElement(this.videoVideoSubtitlesElem);
                this.videoVideoSubtitlesElem = null;
            }
        } else if (this.isSecondaryTrack(targetTrackIndex)) {
            if (this.videoVideoSecondarySubtitlesElem) {
                tryRemoveElement(this.videoVideoSecondarySubtitlesElem);
                this.videoVideoSecondarySubtitlesElem = null;
            }
        } else if (this.videoVideoSubtitlesElem) {
            // destroy all
            const subtitlesContainer = this.videoVideoSubtitlesElem.parentNode;
            if (subtitlesContainer) {
                tryRemoveElement(subtitlesContainer);
            }
            this.videoVideoSubtitlesElem = null;
            this.videoVideoSecondarySubtitlesElem = null;
        }
    }

    destroyNativeTracks(videoElement?: HTMLMediaElement | null, targetTrackIndex?: number) {
        if (videoElement) {
            const destroySingleTrack = typeof targetTrackIndex === 'number';
            const allTracks = videoElement.textTracks || []; // get list of tracks
            for (let index = 0; index < allTracks.length; index++) {
                const track = allTracks[index];
                // Skip all other tracks if we are targeting just one
                if (destroySingleTrack && targetTrackIndex !== index) {
                    continue;
                }
                if (track.label.includes('manualTrack')) {
                    track.mode = 'disabled';
                }
            }
        }
    }

    destroyStoredTrackInfo(targetTrackIndex?: number) {
        if (this.isPrimaryTrack(targetTrackIndex)) {
            this.videoCustomTrackIndex = -1;
            this.videoCurrentTrackEvents = null;
        } else if (this.isSecondaryTrack(targetTrackIndex)) {
            this.videoCustomSecondaryTrackIndex = -1;
            this.videoCurrentSecondaryTrackEvents = null;
        } else { // destroy all
            this.videoCustomTrackIndex = -1;
            this.videoCustomSecondaryTrackIndex = -1;
            this.videoCurrentTrackEvents = null;
            this.videoCurrentSecondaryTrackEvents = null;
        }
    }

    destroyCustomTrack(videoElement?: HTMLMediaElement | null, targetTrackIndex?: number) {
        if (targetTrackIndex === undefined) {
            this.endPendingSubtitleLoad(PRIMARY_TEXT_TRACK_INDEX);
            this.endPendingSubtitleLoad(SECONDARY_TEXT_TRACK_INDEX);
        } else {
            this.endPendingSubtitleLoad(targetTrackIndex);
        }

        this.destroyCustomRenderedTrackElements(targetTrackIndex);
        this.destroyNativeTracks(videoElement, targetTrackIndex);
        this.destroyStoredTrackInfo(targetTrackIndex);

        const octopus = this.videoCurrentAssRenderer;
        if (octopus) {
            octopus.dispose();
        }
        this.videoCurrentAssRenderer = null;

        const pgsOrVobSubRenderer = this.videoCurrentBitmapSubRenderer;
        if (pgsOrVobSubRenderer) {
            pgsOrVobSubRenderer.dispose();
        }
        this.videoCurrentBitmapSubRenderer = null;
    }

    async fetchSubtitles(track: PlayerStream, item: PlayerOptions['item']) {
        return requestSubtitleData(this, () => getTextTrackUrl(track, item, '.js'));
    }

    setTrackForDisplay(videoElement: HTMLVideoElement, track?: PlayerStream | null, targetTextTrackIndex = PRIMARY_TEXT_TRACK_INDEX) {
        if (!track) {
            // Destroy all tracks by passing undefined if there is no valid primary track
            this.destroyCustomTrack(videoElement, this.isSecondaryTrack(targetTextTrackIndex) ? targetTextTrackIndex : undefined);
            return;
        }

        let targetTrackIndex = this.videoCustomTrackIndex;
        if (this.isSecondaryTrack(targetTextTrackIndex)) {
            targetTrackIndex = this.videoCustomSecondaryTrackIndex;
        }

        // skip if already playing this track
        if (targetTrackIndex === track.Index) {
            return;
        }

        this.resetSubtitleOffset();
        const item = this._currentPlayOptions.item;

        this.destroyCustomTrack(videoElement, targetTextTrackIndex);

        if (this.isSecondaryTrack(targetTextTrackIndex)) {
            this.videoCustomSecondaryTrackIndex = track.Index;
        } else {
            this.videoCustomTrackIndex = track.Index;
        }
        void this.renderTracksEvents(videoElement, track, item, targetTextTrackIndex);
    }

    renderSsaAss(videoElement: HTMLVideoElement, track: PlayerStream, item: PlayerOptions['item']) {
        const supportedFonts = ['application/vnd.ms-opentype', 'application/x-truetype-font', 'font/otf', 'font/ttf', 'font/woff', 'font/woff2'];
        const availableFonts: string[] = [];
        const attachments = this._currentPlayOptions.mediaSource.MediaAttachments || [];
        // Client lookup reads ServerId; the playback DTO also permits a nullable Id.
        const apiClient = ServerConnections.getApiClient(item as Parameters<typeof ServerConnections.getApiClient>[0])!;
        attachments.forEach(i => {
            // we only require font files and ignore embedded media attachments like covers as there are cases where ffmpeg fails to extract those
            if (supportedFonts.includes(i.MimeType!)) {
                // embedded font url
                availableFonts.push(apiClient.getUrl(i.DeliveryUrl!));
            }
        });
        const fallbackFontList = apiClient.getUrl('/FallbackFont/Fonts', {
            ApiKey: apiClient.accessToken()
        });
        const clearAssRenderer = () => {
            this.videoCurrentAssRenderer = null;
        };
        void import('@jellyfin/libass-wasm').then(({ default: SubtitlesOctopus }) => {
            const mediaSource = this._currentPlayOptions.mediaSource;
            const videoStream = getMediaStreamVideoTracks(mediaSource)[0];

            const options = {
                video: videoElement,
                subUrl: getTextTrackUrl(track, item),
                fonts: availableFonts,
                workerUrl: `${appRouter.baseUrl()}/libraries/subtitles-octopus-worker-legacy.js`,
                legacyWorkerUrl: `${appRouter.baseUrl()}/libraries/subtitles-octopus-worker-legacy.js`,
                onError() {
                    // HACK: Clear JavascriptSubtitlesOctopus: it gets disposed when an error occurs
                    clearAssRenderer();

                    // HACK: Give JavascriptSubtitlesOctopus time to dispose itself
                    setTimeout(() => {
                        // Preserve the receiver used by the legacy libass error callback.
                        onErrorInternal(this as unknown as import('lib/playback/types/htmlMedia').MediaInstance, MediaError.ASS_RENDER_ERROR);
                    }, 0);
                },
                timeOffset: (this._currentPlayOptions.transcodingOffsetTicks || 0) / TICKS_PER_SECOND,

                // new octopus options; override all, even defaults
                renderMode: 'wasm-blend',
                dropAllAnimations: false,
                libassMemoryLimit: 40,
                libassGlyphLimit: 40,
                targetFps: videoStream?.ReferenceFrameRate || 24,
                prescaleFactor: 0.8,
                prescaleHeightLimit: 1080,
                maxRenderHeight: 2160,
                resizeVariation: 0.2,
                renderAhead: 90
            };

            void Promise.all([
                apiClient.getNamedConfiguration('encoding'),
                // Worker in Tizen 5 doesn't resolve relative path with async request
                resolveUrl(options.workerUrl),
                resolveUrl(options.legacyWorkerUrl)
            ]).then(([config, workerUrl, legacyWorkerUrl]) => {
                options.workerUrl = workerUrl;
                options.legacyWorkerUrl = legacyWorkerUrl;

                if (config.EnableFallbackFont) {
                    void apiClient.getJSON(fallbackFontList).then((fontFiles: { Name: string }[] = []) => {
                        fontFiles.forEach(font => {
                            const fontUrl = apiClient.getUrl(`/FallbackFont/Fonts/${encodeURIComponent(font.Name)}`, {
                                ApiKey: apiClient.accessToken()
                            });
                            availableFonts.push(fontUrl);
                        });
                        this.videoCurrentAssRenderer = new SubtitlesOctopus(options);
                    });
                } else {
                    this.videoCurrentAssRenderer = new SubtitlesOctopus(options);
                }
            });
        });
    }

    renderPgs(videoElement: HTMLVideoElement, track: PlayerStream, item: PlayerOptions['item'], targetTextTrackIndex = PRIMARY_TEXT_TRACK_INDEX) {
        const options = this.createBitmapSubtitleRendererOptions(videoElement, track, item, targetTextTrackIndex);
        const onLoaded = options.onLoaded;
        const onError = options.onError;
        options.onLoaded = () => {
            if (this.videoCurrentBitmapSubRenderer) {
                this.videoCurrentBitmapSubRenderer.timeOffset = getSubtitleTimeOffset(this._currentPlayOptions, this.videoCurrentTrackOffset);
                this.videoCurrentBitmapSubRenderer.updateCanvasSize?.();
            }
            onLoaded?.();
        };
        options.onError = (error?: unknown) => {
            console.error('[libbitsub] pgs error', error);
            onError?.(error as Error);
        };
        options.onEvent = (event) => {
            if (event?.type === 'error' || event?.type === 'loaded' || event?.type === 'cue-change' || event?.type === 'renderer-change' || event?.type === 'worker-state') {
                console.debug('[libbitsub] pgs', event);
            }
        };
        import('libbitsub').then((libbitsub) => {
            this.videoCurrentBitmapSubRenderer = new libbitsub.PgsRenderer(options) as unknown as BitmapSubtitleRenderer;
            requestAnimationFrame(() => {
                if (this.videoCurrentBitmapSubRenderer) {
                    this.videoCurrentBitmapSubRenderer.updateCanvasSize?.();
                }
            });
        }).catch((error) => {
            this.endPendingSubtitleLoad(targetTextTrackIndex);
            console.error(error);
        });
    }

    renderVobSub(videoElement: HTMLVideoElement, track: PlayerStream, item: PlayerOptions['item'], targetTextTrackIndex = PRIMARY_TEXT_TRACK_INDEX) {
        const options = {
            ...this.createBitmapSubtitleRendererOptions(videoElement, track, item, targetTextTrackIndex),
            fileName: getSubtitleFileNameHint(track)
        };
        const onLoaded = options.onLoaded;
        const onError = options.onError;
        options.onLoaded = () => {
            if (this.videoCurrentBitmapSubRenderer) {
                this.videoCurrentBitmapSubRenderer.timeOffset = getSubtitleTimeOffset(this._currentPlayOptions, this.videoCurrentTrackOffset);
                this.videoCurrentBitmapSubRenderer.setDebandEnabled?.(true);
                this.videoCurrentBitmapSubRenderer.setDebandThreshold?.(VOBSUB_DEBAND_THRESHOLD);
                this.videoCurrentBitmapSubRenderer.setDebandRange?.(VOBSUB_DEBAND_RANGE);
                this.videoCurrentBitmapSubRenderer.updateCanvasSize?.();
            }
            onLoaded?.();
        };
        options.onError = (error?: unknown) => {
            console.error('[libbitsub] vobsub error', error);
            onError?.(error as Error);
        };
        options.onEvent = (event) => {
            if (event?.type === 'error' || event?.type === 'loaded' || event?.type === 'cue-change' || event?.type === 'renderer-change' || event?.type === 'worker-state') {
                console.debug('[libbitsub] vobsub', event);
            }
        };
        import('libbitsub').then((libbitsub) => {
            this.videoCurrentBitmapSubRenderer = new libbitsub.VobSubRenderer(options) as unknown as BitmapSubtitleRenderer;
            requestAnimationFrame(() => {
                if (this.videoCurrentBitmapSubRenderer) {
                    this.videoCurrentBitmapSubRenderer.updateCanvasSize?.();
                }
            });
        }).catch((error) => {
            this.endPendingSubtitleLoad(targetTextTrackIndex);
            console.error(error);
        });
    }

    renderSubtitlesWithCustomElement(videoElement: HTMLVideoElement, track: PlayerStream, item: PlayerOptions['item'], targetTextTrackIndex: number) {
        void this.fetchSubtitles(track, item).then((subtitleData) => {
            // Exit if the video element was destroyed while fetching subtitles
            if (!this.videoMediaElement) return;

            const subtitleAppearance = userSettings.getSubtitleAppearanceSettings();
            const subtitleVerticalPosition = parseInt(String(subtitleAppearance.verticalPosition), 10);

            if (!this.videoVideoSubtitlesElem && !this.isSecondaryTrack(targetTextTrackIndex)) {
                let subtitlesContainer = document.querySelector('.videoSubtitles');
                if (!subtitlesContainer) {
                    subtitlesContainer = document.createElement('div');
                    subtitlesContainer.classList.add('videoSubtitles');
                }
                const subtitlesElement = document.createElement('div');
                subtitlesElement.classList.add('videoSubtitlesInner');
                subtitlesContainer.appendChild(subtitlesElement);
                this.videoVideoSubtitlesElem = subtitlesElement;
                this.setSubtitleAppearance(subtitlesContainer, this.videoVideoSubtitlesElem);
                videoElement.parentNode!.appendChild(subtitlesContainer);
                this.videoCurrentTrackEvents = subtitleData.TrackEvents;
            } else if (!this.videoVideoSecondarySubtitlesElem && this.isSecondaryTrack(targetTextTrackIndex)) {
                const subtitlesContainer = document.querySelector('.videoSubtitles');
                if (!subtitlesContainer) return;
                const secondarySubtitlesElement = document.createElement('div');
                secondarySubtitlesElement.classList.add('videoSecondarySubtitlesInner');
                // determine the order of the subtitles
                if (subtitleVerticalPosition < 0) {
                    subtitlesContainer.insertBefore(secondarySubtitlesElement, subtitlesContainer.firstChild);
                } else {
                    subtitlesContainer.appendChild(secondarySubtitlesElement);
                }
                this.videoVideoSecondarySubtitlesElem = secondarySubtitlesElement;
                this.setSubtitleAppearance(subtitlesContainer, this.videoVideoSecondarySubtitlesElem);
                this.videoCurrentSecondaryTrackEvents = subtitleData.TrackEvents;
            }
        });
    }

    setSubtitleAppearance(elem: Element, innerElem: HTMLElement) {
        subtitleAppearanceHelper.applyStyles({
            text: innerElem,
            window: elem
        }, userSettings.getSubtitleAppearanceSettings());
    }

    getCueCss(appearance: { text: { name: string; value?: string | number }[] }, selector: string) {
        return `${selector}::cue {
                ${appearance.text.map((s) => s.value !== undefined && s.value !== '' ? `${s.name}:${s.value}!important;` : '').join('')}
            }`;
    }

    setCueAppearance() {
        const elementId = `${this.id}-cuestyle`;

        let styleElem = document.querySelector(`#${elementId}`);
        if (!styleElem) {
            styleElem = document.createElement('style');
            styleElem.id = elementId;
            document.getElementsByTagName('head')[0].appendChild(styleElem);
        }

        styleElem.innerHTML = this.getCueCss(subtitleAppearanceHelper.getStyles(userSettings.getSubtitleAppearanceSettings()), '.htmlvideoplayer');
    }

    private prepareNativeTrack(videoElement: HTMLVideoElement, targetTextTrackIndex: number) {
        let trackElement = null;
        const updatingTrack = videoElement.textTracks && videoElement.textTracks.length > (this.isSecondaryTrack(targetTextTrackIndex) ? 1 : 0);
        if (updatingTrack) {
            trackElement = videoElement.textTracks[targetTextTrackIndex];
            // This throws an error in IE, but is fine in chrome
            // In IE it's not necessary anyway because changing the src seems to be enough
            try {
                trackElement.mode = 'showing';
                while (trackElement.cues!.length) {
                    trackElement.removeCue(trackElement.cues![0]);
                }
            } catch (e) {
                console.error('error removing cue from textTrack', e);
            }

            trackElement.mode = 'disabled';
        } else {
            // There is a function addTextTrack but no function for removeTextTrack
            // Therefore we add ONE element and replace its cue data
            trackElement = videoElement.addTextTrack('subtitles', 'manualTrack', 'und');
        }

        return trackElement;
    }

    async renderTracksEvents(videoElement: HTMLVideoElement, track: PlayerStream, item: PlayerOptions['item'], targetTextTrackIndex = PRIMARY_TEXT_TRACK_INDEX) {
        if (!itemHelper.isLocalItem(item) || track.IsExternal) {
            const format = (track.Codec || '').toLowerCase();
            if (ASS_SUBTITLE_CODECS.includes(format)) {
                this.renderSsaAss(videoElement, track, item);
                return;
            }
            if (format === 'pgssub') {
                this.renderPgs(videoElement, track, item, targetTextTrackIndex);
                return;
            }
            if (VOBSUB_SUBTITLE_CODECS.includes(format)) {
                this.renderVobSub(videoElement, track, item, targetTextTrackIndex);
                return;
            }

            if (useCustomSubtitles(userSettings)) {
                this.renderSubtitlesWithCustomElement(videoElement, track, item, targetTextTrackIndex);
                return;
            }
        }

        const trackElement = this.prepareNativeTrack(videoElement, targetTextTrackIndex);

        // download the track json
        void this.fetchSubtitles(track, item).then(data => {
            // Exit if the video element was destroyed while fetching subtitles
            if (!this.videoMediaElement) return;

            console.debug(`downloaded ${data.TrackEvents.length} track events`);

            const subtitleAppearance = userSettings.getSubtitleAppearanceSettings();
            const cueLine = parseInt(String(subtitleAppearance.verticalPosition), 10);

            // add some cues to show the text
            // in safari, the cues need to be added before setting the track mode to showing
            for (const trackEvent of data.TrackEvents) {
                const TrackCue = window.VTTCue || window.TextTrackCue;
                const text = normalizeTrackEventText(trackEvent.Text, false);
                const cue = new TrackCue(trackEvent.StartPositionTicks / TICKS_PER_SECOND, trackEvent.EndPositionTicks / TICKS_PER_SECOND, text);

                if (cue.line === 'auto') {
                    if (cueLine < 0) {
                        const lineCount = (text.match(/\n/g) || []).length;
                        cue.line = cueLine - lineCount;
                    } else {
                        cue.line = cueLine;
                    }
                }

                trackElement.addCue(cue);
            }

            trackElement.mode = 'showing';
        });
    }

    private updateSubtitleTrack(timeMs: number, trackEvents: SubtitleData['TrackEvents'], subtitleTextElement: HTMLElement) {
        const ticks = timeMs * TICKS_PER_MILLISECOND;
        let selectedTrackEvent;
        for (const trackEvent of trackEvents) {
            if (trackEvent.StartPositionTicks <= ticks && trackEvent.EndPositionTicks >= ticks) {
                selectedTrackEvent = trackEvent;
                break;
            }
        }

        if (this.videoRenderedSubtitleEvents.has(subtitleTextElement)
                    && this.videoRenderedSubtitleEvents.get(subtitleTextElement) === selectedTrackEvent) {
            return;
        }
        this.videoRenderedSubtitleEvents.set(subtitleTextElement, selectedTrackEvent);

        if (selectedTrackEvent?.Text) {
            subtitleTextElement.innerHTML = DOMPurify.sanitize(
                normalizeTrackEventText(selectedTrackEvent.Text, true));
            subtitleTextElement.classList.remove('hide');
        } else {
            subtitleTextElement.classList.add('hide');
        }
    }

    updateSubtitleText(timeMs: number) {
        const allTrackEvents = [this.videoCurrentTrackEvents, this.videoCurrentSecondaryTrackEvents];
        const subtitleTextElements = [this.videoVideoSubtitlesElem, this.videoVideoSecondarySubtitlesElem];

        for (let i = 0; i < allTrackEvents.length; i++) {
            const trackEvents = allTrackEvents[i];
            const subtitleTextElement = subtitleTextElements[i];

            if (trackEvents && subtitleTextElement) {
                this.updateSubtitleTrack(timeMs, trackEvents, subtitleTextElement);
            }
        }
    }

    setCurrentTrackElement(streamIndex?: number, targetTextTrackIndex = PRIMARY_TEXT_TRACK_INDEX) {
        console.debug(`setting new text track index to: ${streamIndex}`);

        const mediaStreamTextTracks = getMediaStreamTextTracks(this._currentPlayOptions.mediaSource);

        let track = streamIndex === -1 ? null : mediaStreamTextTracks.filter(function (t) {
            return t.Index === streamIndex;
        })[0];

        // This play method can only check if it is real direct play, and will mark Remux as Transcode as well
        const isDirectPlay = this._currentPlayOptions.playMethod === 'DirectPlay';
        const burnInWhenTranscoding = appSettings.alwaysBurnInSubtitleWhenTranscoding(undefined);

        let sessionPromise;
        if (!isDirectPlay && burnInWhenTranscoding) {
            const apiClient = ServerConnections.getApiClient(this._currentPlayOptions.item.ServerId)!;
            sessionPromise = apiClient.getSessions({
                deviceId: apiClient.deviceId()
            }).then(function (sessions) {
                return sessions[0] || {};
            }, function () {
                return Promise.resolve({});
            });
        } else {
            sessionPromise = Promise.resolve({});
        }

        void sessionPromise.then((s) => {
            if (!s.TranscodingInfo || s.TranscodingInfo.IsVideoDirect) {
                // restore recorded delivery method if any
                mediaStreamTextTracks.forEach((t) => {
                    t.DeliveryMethod = t.realDeliveryMethod ?? t.DeliveryMethod;
                });
                this.setTrackForDisplay(this.videoMediaElement!, track, targetTextTrackIndex);
                if (enableNativeTrackSupport(this._currentPlayOptions?.mediaSource, track)) {
                    if (streamIndex !== -1) {
                        this.setCueAppearance();
                    }
                } else {
                    // null these out to disable the player's native display (handled below)
                    streamIndex = -1;
                    track = null;
                }
            } else {
                // record the original delivery method and set all delivery method to encode
                // this is needed for subtitle track switching to properly reload the video stream
                mediaStreamTextTracks.forEach((t) => {
                    t.realDeliveryMethod = t.DeliveryMethod;
                    t.DeliveryMethod = 'Encode';
                });
                // unset stream when switching to transcode
                this.setTrackForDisplay(this.videoMediaElement!, null, -1);
            }
        });
    }
}
