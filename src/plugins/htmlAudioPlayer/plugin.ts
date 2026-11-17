import { initializeAudioPlayer } from 'components/playback/audioPlayerLifecycle';
import type { BrowserDetection, PlayerOptions } from 'types/legacyPlayer';

import detectedBrowser from '../../scripts/browser';
import { appHost } from '../../components/apphost';
import * as htmlMediaHelper from '../../components/htmlMediaHelper';
import profileBuilder from '../../scripts/browserDeviceProfile';

const browser = detectedBrowser as BrowserDetection;

function getDefaultProfile() {
    return profileBuilder({});
}

export class HtmlAudioPlayer {
    name!: string;
    type!: string;
    id!: string;
    priority!: number;
    _started?: boolean;
    _timeUpdated?: boolean;
    _isFadingOut?: boolean;
    _currentTime?: number | null;
    _currentSrc?: string | null;
    _currentPlayOptions!: PlayerOptions;
    _mediaElement!: HTMLAudioElement;
    gainNode?: GainNode;
    normalizationGain!: number;
    play!: (options: PlayerOptions) => Promise<void>;
    stop!: (destroyPlayer?: boolean) => Promise<void>;
    destroy!: () => void;

    constructor() {
        initializeAudioPlayer(this);
    }

    currentSrc() {
        return this._currentSrc;
    }

    canPlayMediaType(mediaType?: string | null) {
        return (mediaType || '').toLowerCase() === 'audio';
    }

    getDeviceProfile(item?: PlayerOptions['item'] | null) {
        if (appHost.getDeviceProfile) {
            return appHost.getDeviceProfile(item);
        }

        return getDefaultProfile();
    }

    toggleAirPlay() {
        return this.setAirPlayEnabled(!this.isAirPlayEnabled());
    }

    // Save this for when playback stops, because querying the time at that point might return 0
    currentTime(val?: number) {
        const mediaElement = this._mediaElement;
        if (mediaElement) {
            if (val != null) {
                mediaElement.currentTime = val / 1000;
                return;
            }

            const currentTime = this._currentTime;
            if (currentTime) {
                return currentTime * 1000;
            }

            return (mediaElement.currentTime || 0) * 1000;
        }
    }

    duration() {
        const mediaElement = this._mediaElement;
        if (mediaElement) {
            const duration = mediaElement.duration;
            if (htmlMediaHelper.isValidDuration(duration)) {
                return duration * 1000;
            }
        }

        return null;
    }

    seekable() {
        const mediaElement = this._mediaElement;
        if (mediaElement) {
            const seekable = mediaElement.seekable;
            if (seekable?.length) {
                let start = seekable.start(0);
                let end = seekable.end(0);

                if (!htmlMediaHelper.isValidDuration(start)) {
                    start = 0;
                }
                if (!htmlMediaHelper.isValidDuration(end)) {
                    end = 0;
                }

                return (end - start) > 0;
            }

            return false;
        }
    }

    getBufferedRanges() {
        const mediaElement = this._mediaElement;
        if (mediaElement) {
            return htmlMediaHelper.getBufferedRanges(this, mediaElement);
        }

        return [];
    }

    pause() {
        const mediaElement = this._mediaElement;
        if (mediaElement) {
            mediaElement.pause();
        }
    }

    // This is a retry after error
    resume() {
        this.unpause();
    }

    unpause() {
        const mediaElement = this._mediaElement;
        if (mediaElement) {
            void mediaElement.play();
        }
    }

    paused() {
        const mediaElement = this._mediaElement;
        if (mediaElement) {
            return mediaElement.paused;
        }

        return false;
    }

    setPlaybackRate(value: number) {
        const mediaElement = this._mediaElement;
        if (mediaElement) {
            mediaElement.playbackRate = value;
        }
    }

    getPlaybackRate() {
        const mediaElement = this._mediaElement;
        if (mediaElement) {
            return mediaElement.playbackRate;
        }
        return null;
    }

    setVolume(val: number) {
        const mediaElement = this._mediaElement;
        if (mediaElement) {
            mediaElement.volume = Math.pow(val / 100, 3);
        }
    }

    getVolume() {
        const mediaElement = this._mediaElement;
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
        const mediaElement = this._mediaElement;
        if (mediaElement) {
            mediaElement.muted = mute;
        }
    }

    isMuted() {
        const mediaElement = this._mediaElement;
        if (mediaElement) {
            return mediaElement.muted;
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
        const mediaElement = this._mediaElement;

        if (mediaElement) {
            if (document.AirPlayEnabled) {
                if (isEnabled) {
                    mediaElement.requestAirPlay().catch(function(err) {
                        console.error('Error requesting AirPlay', err);
                    });
                } else {
                    document.exitAirPLay().catch(function(err) {
                        console.error('Error exiting AirPlay', err);
                    });
                }
            } else {
                mediaElement.webkitShowPlaybackTargetPicker();
            }
        }
    }

    supports(feature: string) {
        if (!supportedFeatures) {
            supportedFeatures = getSupportedFeatures();
        }

        return supportedFeatures.indexOf(feature) !== -1;
    }
}

let supportedFeatures: string[] | undefined;

function getSupportedFeatures() {
    const list = [];
    const audio = document.createElement('audio');

    if (typeof audio.playbackRate === 'number') {
        list.push('PlaybackRate');
    }

    if (browser.safari) {
        list.push('AirPlay');
    }

    return list;
}

export default HtmlAudioPlayer;
