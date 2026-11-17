import { destroyHlsPlayer, handleHlsJsMediaError, startHlsPlayback, isHlsAudioSource } from './hlsPlayer';
import { enableHlsJsPlayer } from 'lib/playback/hlsSupport';
import type { BrowserDetection, PlayerOptions } from 'types/legacyPlayer';
import { AppFeature } from 'constants/appFeature';
import { PluginType } from 'constants/pluginType';
import { TICKS_PER_SECOND } from 'constants/time';
import { MediaError } from 'types/mediaError';

import detectedBrowser from '../../scripts/browser';
import { appHost } from '../../components/apphost';
import * as htmlMediaHelper from '../../components/htmlMediaHelper';

import { getIncludeCorsCredentials } from '../../scripts/settings/webSettings';
import Events from '../../utils/events';

const browser = detectedBrowser as BrowserDetection;

import type { HtmlAudioPlayer } from '../../plugins/htmlAudioPlayer/plugin';

let fadeTimeout: ReturnType<typeof setTimeout> | null;
function fade(instance: HtmlAudioPlayer, elem: HTMLAudioElement, startingVolume: number): Promise<void> {
    instance._isFadingOut = true;

    // Need to record the starting volume on each pass rather than querying elem.volume
    // This is due to iOS safari not allowing volume changes and always returning the system volume value
    const newVolume = Math.max(0, startingVolume - 0.15);
    console.debug('fading volume to ' + newVolume);
    elem.volume = newVolume;

    if (newVolume <= 0) {
        instance._isFadingOut = false;
        return Promise.resolve();
    }

    return new Promise(function (resolve, reject) {
        cancelFadeTimeout();
        fadeTimeout = setTimeout(function () {
            fade(instance, elem, newVolume).then(resolve, reject);
        }, 100);
    });
}

function cancelFadeTimeout() {
    const timeout = fadeTimeout;
    if (timeout) {
        clearTimeout(timeout);
        fadeTimeout = null;
    }
}

function supportsFade() {
    // Not working on tizen.
    // We could possibly enable on other tv's, but all smart tv browsers tend to be pretty primitive
    return !browser.tv;
}

export function initializeAudioPlayer(self: HtmlAudioPlayer) {
    let sourceRequest = 0;
    self.name = 'Html Audio Player';
    self.type = PluginType.MediaPlayer;
    self.id = 'htmlaudioplayer';

    // Let any players created by plugins take priority
    self.priority = 1;

    self.play = function (options) {
        self._started = false;
        self._timeUpdated = false;
        self._currentTime = null;

        const elem = createMediaElement();

        return setCurrentSrc(elem, options);
    };

    async function setCurrentSrc(elem: HTMLAudioElement, options: PlayerOptions) {
        const request = ++sourceRequest;
        unBindEvents(elem);
        bindEvents(elem);

        let val = options.url;
        console.debug('playing url: ' + val);
        import('../../scripts/settings/userSettings').then((userSettings) => {
            if (browser.iOS) {
                // createMediaElementSource breaks playbackRate and pitch on iOS WebKit
                return;
            }

            let normalizationGain;
            if (userSettings.selectAudioNormalization() == 'TrackGain') {
                normalizationGain = options.item.NormalizationGain
                        ?? options.mediaSource.albumNormalizationGain;
            } else if (userSettings.selectAudioNormalization() == 'AlbumGain') {
                normalizationGain =
                        options.mediaSource.albumNormalizationGain
                        ?? options.item.NormalizationGain;
            } else {
                console.debug('normalization disabled');
                return;
            }

            if (!self.gainNode) {
                addGainElement(elem);
                if (!self.gainNode) return;
            }

            if (normalizationGain) {
                self.normalizationGain = Math.pow(10, normalizationGain / 20);
                self.gainNode!.gain.value = self.normalizationGain;
            } else {
                self.gainNode!.gain.value = 1;
                self.normalizationGain = 1;
            }
            if (browser.safari) {
                // Gain value is absolute in Safari. Add volume from the slider
                self.gainNode!.gain.value *= elem.volume;
            }
            console.debug('gain: ' + self.normalizationGain);
        }).catch((err) => {
            console.error('Failed to add/change gainNode', err);
        });

        // Convert to seconds
        const seconds = (options.playerStartPositionTicks || 0) / TICKS_PER_SECOND;
        if (seconds) {
            val += '#t=' + seconds;
        }

        destroyHlsPlayer(self);
        self._currentPlayOptions = options;

        const crossOrigin = htmlMediaHelper.getCrossOriginValue(options.mediaSource);
        if (crossOrigin) {
            elem.crossOrigin = crossOrigin;
        }

        // This avoids the AudioContext being suspended when Safari is put into background
        if ('audioSession' in navigator) {
            navigator.audioSession.type = 'playback';
        }

        const hlsEnabled = enableHlsJsPlayer(options.mediaSource.RunTimeTicks, 'Audio');
        const hlsSource = hlsEnabled && await isHlsAudioSource(val);
        if (request !== sourceRequest) {
            const error = new Error('Audio source cancelled');
            error.name = 'AbortError';
            throw error;
        }
        if (hlsSource) {
            self._currentSrc = val;
            return startHlsPlayback(self, elem, val, onError);
        }

        return getIncludeCorsCredentials().then((includeCorsCredentials) => {
            elem.autoplay = true;

            if (includeCorsCredentials) {
                // Safari will not send cookies without this
                elem.crossOrigin = 'use-credentials';
            }

            return htmlMediaHelper.applySrc(elem, val, options).then(function () {
                self._currentSrc = val;

                return htmlMediaHelper.playWithPromise(elem, onError);
            });
        });
    }

    function bindEvents(elem: HTMLAudioElement) {
        elem.addEventListener('timeupdate', onTimeUpdate);
        elem.addEventListener('ended', onEnded);
        elem.addEventListener('volumechange', onVolumeChange);
        elem.addEventListener('pause', onPause);
        elem.addEventListener('playing', onPlaying);
        elem.addEventListener('play', onPlay);
        elem.addEventListener('waiting', onWaiting);
    }

    function unBindEvents(elem: HTMLAudioElement) {
        elem.removeEventListener('timeupdate', onTimeUpdate);
        elem.removeEventListener('ended', onEnded);
        elem.removeEventListener('volumechange', onVolumeChange);
        elem.removeEventListener('pause', onPause);
        elem.removeEventListener('playing', onPlaying);
        elem.removeEventListener('play', onPlay);
        elem.removeEventListener('waiting', onWaiting);
        elem.removeEventListener('error', onError); // bound in htmlMediaHelper
    }

    self.stop = function (destroyPlayer) {
        sourceRequest++;
        if (!self._hlsPlayer) destroyHlsPlayer(self);
        cancelFadeTimeout();

        const elem = self._mediaElement;
        const src = self._currentSrc;

        if (elem && src) {
            if (!destroyPlayer || !supportsFade()) {
                elem.pause();

                htmlMediaHelper.onEndedInternal(self, elem, onError);

                if (destroyPlayer) {
                    self.destroy();
                }
                return Promise.resolve();
            }

            const originalVolume = elem.volume;

            return fade(self, elem, elem.volume).then(function () {
                elem.pause();
                elem.volume = originalVolume;

                htmlMediaHelper.onEndedInternal(self, elem, onError);

                if (destroyPlayer) {
                    self.destroy();
                }
            });
        }
        return Promise.resolve();
    };

    self.destroy = function () {
        sourceRequest++;
        destroyHlsPlayer(self);
        unBindEvents(self._mediaElement);
        htmlMediaHelper.resetSrc(self._mediaElement);
    };

    function createMediaElement() {
        let elem = self._mediaElement;

        if (elem) {
            return elem;
        }

        elem = document.querySelector<HTMLAudioElement>('.mediaPlayerAudio')!;

        if (!elem) {
            elem = document.createElement('audio');
            elem.classList.add('mediaPlayerAudio');
            elem.classList.add('hide');

            document.body.appendChild(elem);
        }

        // TODO: Move volume control to PlaybackManager. Player should just be a wrapper that translates commands into API calls.
        if (!appHost.supports(AppFeature.PhysicalVolumeControl)) {
            elem.volume = htmlMediaHelper.getSavedVolume();
        }

        self._mediaElement = elem;

        return elem;
    }

    function addGainElement(elem: HTMLAudioElement) {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext; /* eslint-disable-line compat/compat */

            const audioCtx = new AudioContext();
            const source = audioCtx.createMediaElementSource(elem);

            const gainNode = audioCtx.createGain();

            source.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            self.gainNode = gainNode;
        } catch (e) {
            console.error('Web Audio API is not supported in this browser', e);
        }
    }

    function onEnded(this: HTMLAudioElement) {
        htmlMediaHelper.onEndedInternal(self, this, onError);
    }

    function onTimeUpdate(this: HTMLAudioElement) {
        // Get the player position + the transcoding offset
        const time = this.currentTime;

        // Don't trigger events after user stop
        if (!self._isFadingOut) {
            self._currentTime = time;
            Events.trigger(self, 'timeupdate');
        }
    }

    function onVolumeChange(this: HTMLAudioElement) {
        if (!self._isFadingOut) {
            htmlMediaHelper.saveVolume(this.volume);
            if (browser.safari && self.gainNode) {
                self.gainNode!.gain.value = this.volume * self.normalizationGain;
            }
            Events.trigger(self, 'volumechange');
        }
    }

    function onPlaying(this: HTMLAudioElement) {
        if (!self._started) {
            self._started = true;
            this.removeAttribute('controls');

            htmlMediaHelper.seekOnPlaybackStart(self, this, self._currentPlayOptions.playerStartPositionTicks);
        }
        Events.trigger(self, 'playing');
    }

    function onPlay() {
        Events.trigger(self, 'unpause');
    }

    function onPause() {
        Events.trigger(self, 'pause');
    }

    function onWaiting() {
        Events.trigger(self, 'waiting');
    }

    function onError(this: HTMLAudioElement) {
        const errorCode = this.error ? (this.error.code || 0) : 0;
        const errorMessage = this.error ? (this.error.message || '') : '';
        console.error('media element error: ' + errorCode.toString() + ' ' + errorMessage);

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
                if (self._hlsPlayer) {
                    handleHlsJsMediaError(self);
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

        htmlMediaHelper.onErrorInternal(self, type);
    }
}
