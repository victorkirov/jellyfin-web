import { PluginType } from 'constants/pluginType';
import { setBackdropTransparency, TRANSPARENCY_LEVEL } from '../../components/backdrop/backdrop';
import Events from '../../utils/events';
import { createMediaElement, onEndedInternal, setCurrentSrc } from './youtubeMedia';
import type { YoutubeApiPlayer, YoutubePlayOptions } from './youtubeTypes';

class YoutubePlayer {
    name: string;
    type: PluginType;
    id: string;
    priority: number;
    started?: boolean;
    videoDialog?: HTMLDivElement | null;
    currentYoutubePlayer?: YoutubeApiPlayer | null;
    timeUpdateInterval?: ReturnType<typeof setInterval> | null;
    resizeListener?: (() => void) | null;
    _currentSrc?: string | null;
    constructor() {
        this.name = 'Youtube Player';
        this.type = PluginType.MediaPlayer;
        this.id = 'youtubeplayer';

        // Let any players created by plugins take priority
        this.priority = 1;
    }
    play(options: YoutubePlayOptions) {
        this.started = false;

        return createMediaElement(this, options).then((elem) => {
            return setCurrentSrc(this, elem, options);
        });
    }
    stop(destroyPlayer?: boolean) {
        const src = this._currentSrc;

        if (src) {
            if (this.currentYoutubePlayer) {
                this.currentYoutubePlayer.stopVideo();
            }
            onEndedInternal(this);

            if (destroyPlayer) {
                this.destroy();
            }
        }

        return Promise.resolve();
    }
    destroy() {
        setBackdropTransparency(TRANSPARENCY_LEVEL.None);
        document.body.classList.remove('hide-scroll');

        const dlg = this.videoDialog;
        if (dlg) {
            this.videoDialog = null;

            dlg.parentNode!.removeChild(dlg);
        }
    }
    canPlayMediaType(mediaType?: string) {
        mediaType = (mediaType || '').toLowerCase();

        return mediaType === 'audio' || mediaType === 'video';
    }
    canPlayItem() {
        // Does not play server items
        return false;
    }
    canPlayUrl(url: string) {
        return url.toLowerCase().indexOf('youtube.com') !== -1;
    }
    getDeviceProfile() {
        return Promise.resolve({});
    }
    currentSrc() {
        return this._currentSrc;
    }
    setSubtitleStreamIndex() {
        // not supported
    }
    canSetAudioStreamIndex() {
        return false;
    }
    setAudioStreamIndex() {
        // not supported
    }
    // Save this for when playback stops, because querying the time at that point might return 0
    currentTime(val?: number) {
        const currentYoutubePlayer = this.currentYoutubePlayer;

        if (currentYoutubePlayer) {
            if (val != null) {
                currentYoutubePlayer.seekTo(val / 1000, true);
                return;
            }

            return currentYoutubePlayer.getCurrentTime() * 1000;
        }
    }
    duration() {
        const currentYoutubePlayer = this.currentYoutubePlayer;

        if (currentYoutubePlayer) {
            return currentYoutubePlayer.getDuration() * 1000;
        }
        return null;
    }
    pause() {
        const currentYoutubePlayer = this.currentYoutubePlayer;

        if (currentYoutubePlayer) {
            currentYoutubePlayer.pauseVideo();

            // This needs a delay before the youtube player will report the correct player state
            setTimeout(() => {
                Events.trigger(this, 'pause');
            }, 200);
        }
    }
    unpause() {
        const currentYoutubePlayer = this.currentYoutubePlayer;

        if (currentYoutubePlayer) {
            currentYoutubePlayer.playVideo();

            // This needs a delay before the youtube player will report the correct player state
            setTimeout(() => {
                Events.trigger(this, 'unpause');
            }, 200);
        }
    }
    paused() {
        const currentYoutubePlayer = this.currentYoutubePlayer;

        if (currentYoutubePlayer) {
            return currentYoutubePlayer.getPlayerState() === 2;
        }

        return false;
    }
    volume(val?: number) {
        if (val != null) {
            return this.setVolume(val);
        }

        return this.getVolume();
    }
    setVolume(val: number) {
        const currentYoutubePlayer = this.currentYoutubePlayer;

        if (currentYoutubePlayer && val != null) {
            currentYoutubePlayer.setVolume(val);
        }
    }
    getVolume() {
        const currentYoutubePlayer = this.currentYoutubePlayer;

        if (currentYoutubePlayer) {
            return currentYoutubePlayer.getVolume();
        }
    }
    setMute(mute: boolean) {
        const currentYoutubePlayer = this.currentYoutubePlayer;

        if (mute) {
            if (currentYoutubePlayer) {
                currentYoutubePlayer.mute();
            }
        } else if (currentYoutubePlayer) {
            currentYoutubePlayer.unMute();
        }
    }
    isMuted() {
        const currentYoutubePlayer = this.currentYoutubePlayer;

        if (currentYoutubePlayer) {
            return currentYoutubePlayer.isMuted();
        }
    }
}

export default YoutubePlayer;
