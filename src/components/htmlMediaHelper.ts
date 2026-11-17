export { enableHlsJsPlayer, enableHlsJsPlayerForCodecs } from 'lib/playback/hlsSupport';
import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client/models/media-source-info';

import type { MediaInstance, MediaPlayOptions, WindowsMediaAdapter } from 'lib/playback/types/htmlMedia';
import { TICKS_PER_MILLISECOND, TICKS_PER_SECOND } from 'constants/time';

import appSettings from '../scripts/settings/appSettings';
import Events from '../utils/events';

export function getSavedVolume() {
    return appSettings.get('volume') || 1;
}

export function saveVolume(value: number) {
    if (value) {
        appSettings.set('volume', value);
    }
}

export function getCrossOriginValue(mediaSource: MediaSourceInfo) {
    if (mediaSource.IsRemote) {
        return null;
    }

    return 'anonymous';
}

export function onErrorInternal(instance: MediaInstance, type: string) {
    destroyHlsPlayer(instance);
    if (instance.destroyCustomTrack) {
        instance.destroyCustomTrack(instance._mediaElement);
    }

    Events.trigger(instance, 'error', [{ type }]);
}

export function isValidDuration(duration: number) {
    return !!duration && !isNaN(duration)
        && duration !== Number.POSITIVE_INFINITY && duration !== Number.NEGATIVE_INFINITY;
}

function setCurrentTimeIfNeeded(element: HTMLMediaElement, seconds: number) {
    // If it's worth skipping (1 sec or less of a difference)
    if (Math.abs((element.currentTime || 0) - seconds) >= 1) {
        element.currentTime = seconds;
    }
}

export function seekOnPlaybackStart(instance: MediaInstance, element: HTMLMediaElement, ticks?: number | null, onMediaReady?: () => void) {
    const seconds = (ticks || 0) / TICKS_PER_SECOND;

    if (seconds) {
        // Appending #t=xxx to the query string doesn't seem to work with HLS
        // For plain video files, not all browsers support it either

        if (element.duration >= seconds) {
            setCurrentTimeIfNeeded(element, seconds);
            if (onMediaReady) onMediaReady();
        } else {
            const events = ['durationchange', 'loadeddata', 'play', 'loadedmetadata'];
            const onMediaChange = function(e: Event) {
                if (element.currentTime === 0 && element.duration >= seconds) {
                    // Ignore later media events after playback advances or seeks.
                    console.debug(`seeking to ${seconds} on ${e.type} event`);
                    setCurrentTimeIfNeeded(element, seconds);
                    events.forEach(name => {
                        element.removeEventListener(name, onMediaChange);
                    });
                    if (onMediaReady) onMediaReady();
                }
            };
            events.forEach(name => {
                element.addEventListener(name, onMediaChange);
            });
        }
    }
}

export function applySrc(elem: HTMLMediaElement, src: string, options: MediaPlayOptions) {
    const windows = (window as Window & { Windows?: WindowsMediaAdapter }).Windows;
    if (windows && options.mediaSource?.IsLocal) {
        return windows.Storage.StorageFile.getFileFromPathAsync(options.url).then(function (file) {
            const playlist = new windows.Media.Playback.MediaPlaybackList();

            const source1 = windows.Media.Core.MediaSource.createFromStorageFile(file);
            const startTimeMs = (options.playerStartPositionTicks || 0) / TICKS_PER_MILLISECOND;
            playlist.items.append(new windows.Media.Playback.MediaPlaybackItem(source1, startTimeMs));
            // UWP accepts a playback list and an options argument instead of a Blob.
            const createObjectURL = URL.createObjectURL as unknown as (list: typeof playlist, options: { oneTimeOnly: boolean }) => string;
            elem.src = createObjectURL.call(URL, playlist, { oneTimeOnly: true });
            return Promise.resolve();
        });
    } else {
        elem.src = src;
    }

    return Promise.resolve();
}

export function resetSrc(elem: HTMLMediaElement) {
    elem.src = '';
    elem.innerHTML = '';
    elem.removeAttribute('src');
}

function onSuccessfulPlay(elem: HTMLMediaElement, onErrorFn: EventListener) {
    elem.addEventListener('error', onErrorFn);
}

export function playWithPromise(elem: HTMLMediaElement, onErrorFn: EventListener) {
    let playResult: Promise<void> | undefined;
    try {
        playResult = elem.play();
        if (!playResult) {
            throw new TypeError('The media element did not return a playback promise');
        }
    } catch (err) {
        console.error('error calling video.play: ' + err);
        return Promise.reject();
    }
    return playResult.catch((error) => {
        const errorName = (error.name || '').toLowerCase();
        // Autoplay can still be started from the media element after these failures.
        if (errorName === 'notallowederror' || errorName === 'aborterror') {
            return;
        }
        throw error;
    }).then(() => {
        onSuccessfulPlay(elem, onErrorFn);
    });
}

export function destroyCastPlayer(instance: MediaInstance) {
    const player = instance._castPlayer;
    if (player) {
        try {
            player.unload();
        } catch (err) {
            console.error(err);
        }

        instance._castPlayer = null;
    }
}

export function destroyHlsPlayer(instance: MediaInstance) {
    const request = instance._hlsRequest;
    instance._hlsRequest = null;
    request?.cancel();
    const player = instance._hlsPlayer;
    instance._hlsPlayer = null;
    if (player) {
        try {
            player.destroy();
        } catch (error) {
            console.error(error);
        }
    }
}

export function destroyFlvPlayer(instance: MediaInstance) {
    const player = instance._flvPlayer;
    if (player) {
        try {
            player.unload();
            player.detachMediaElement();
            player.destroy();
        } catch (err) {
            console.error(err);
        }

        instance._flvPlayer = null;
    }
}

export function onEndedInternal(instance: MediaInstance, elem: HTMLMediaElement, onErrorFn: EventListener) {
    elem.removeEventListener('error', onErrorFn);

    resetSrc(elem);

    destroyHlsPlayer(instance);
    destroyFlvPlayer(instance);
    destroyCastPlayer(instance);

    const stopInfo = {
        src: instance._currentSrc
    };

    Events.trigger(instance, 'stopped', [stopInfo]);

    instance._currentTime = null;
    instance._currentSrc = null;
    instance._currentPlayOptions = null;
}

export function getBufferedRanges(instance: MediaInstance, elem: HTMLMediaElement) {
    const ranges = [];
    const seekable = elem.buffered;

    let offsetTicks;
    const currentPlayOptions = instance._currentPlayOptions;
    if (currentPlayOptions) {
        offsetTicks = currentPlayOptions.transcodingOffsetTicks;
    }

    offsetTicks = offsetTicks || 0;

    for (let i = 0, length = seekable.length; i < length; i++) {
        let start = seekable.start(i);
        let end = seekable.end(i);

        if (!isValidDuration(start)) {
            start = 0;
        }
        if (!isValidDuration(end)) {
            // eslint-disable-next-line sonarjs/no-dead-store
            end = 0;
            continue;
        }

        ranges.push({
            start: (start * TICKS_PER_SECOND) + offsetTicks,
            end: (end * TICKS_PER_SECOND) + offsetTicks
        });
    }

    return ranges;
}
