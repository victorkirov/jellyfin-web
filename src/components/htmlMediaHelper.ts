import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client/models/media-source-info';

import appSettings from '../scripts/settings/appSettings';
import Events from '../utils/events';


type MediaPlayOptions = {
    mediaSource?: MediaSourceInfo & { IsLocal?: boolean };
    url?: string;
    playerStartPositionTicks?: number;
    transcodingOffsetTicks?: number;
};

type UnloadablePlayer = { unload: () => void };

type MediaInstance = {
    _mediaElement?: HTMLMediaElement;
    destroyCustomTrack?: (element?: HTMLMediaElement) => void;
    _castPlayer?: UnloadablePlayer | null;
    _flvPlayer?: (UnloadablePlayer & { detachMediaElement: () => void; destroy: () => void }) | null;
    _currentSrc?: string | null;
    _currentTime?: number | null;
    _currentPlayOptions?: MediaPlayOptions | null;
};

// Keep the dormant UWP adapter typed without requiring Windows globals on TV.
type WindowsMediaAdapter = {
    Storage: { StorageFile: { getFileFromPathAsync: (path?: string) => Promise<unknown> } };
    Media: {
        Playback: {
            MediaPlaybackList: new () => { items: { append: (item: unknown) => void } };
            MediaPlaybackItem: new (source: unknown, startTimeMs: number) => unknown;
        };
        Core: { MediaSource: { createFromStorageFile: (file: unknown) => unknown } };
    };
};

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
    // Needed for video
    if (instance.destroyCustomTrack) {
        instance.destroyCustomTrack(instance._mediaElement);
    }

    Events.trigger(instance, 'error', [{ type }]);
}

export function isValidDuration(duration: number) {
    return duration
            && !isNaN(duration)
            && duration !== Number.POSITIVE_INFINITY
            && duration !== Number.NEGATIVE_INFINITY;
}

function setCurrentTimeIfNeeded(element: HTMLMediaElement, seconds: number) {
    // If it's worth skipping (1 sec or less of a difference)
    if (Math.abs((element.currentTime || 0) - seconds) >= 1) {
        element.currentTime = seconds;
    }
}

export function seekOnPlaybackStart(instance: MediaInstance, element: HTMLMediaElement, ticks?: number, onMediaReady?: () => void) {
    const seconds = (ticks || 0) / 10000000;

    if (seconds) {
        // Appending #t=xxx to the query string doesn't seem to work with HLS
        // For plain video files, not all browsers support it either

        if (element.duration >= seconds) {
            // media is ready, seek immediately
            setCurrentTimeIfNeeded(element, seconds);
            if (onMediaReady) onMediaReady();
        } else {
            // update video player position when media is ready to be sought
            const events = ['durationchange', 'loadeddata', 'play', 'loadedmetadata'];
            const onMediaChange = function(e: Event) {
                if (element.currentTime === 0 && element.duration >= seconds) {
                    // seek only when video position is exactly zero,
                    // as this is true only if video hasn't started yet or
                    // user rewound to the very beginning
                    // (but rewinding cannot happen as the first event with media of non-empty duration)
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
            const startTime = (options.playerStartPositionTicks || 0) / 10000;
            playlist.items.append(new windows.Media.Playback.MediaPlaybackItem(source1, startTime));
            // UWP accepts a playback list and an options argument instead of a Blob.
            const createObjectURL = URL.createObjectURL as unknown as (list: typeof playlist, options: { oneTimeOnly: boolean }) => string;
            elem.src = createObjectURL(playlist, { oneTimeOnly: true });
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
    try {
        return elem.play()
            .catch((e) => {
                const errorName = (e.name || '').toLowerCase();
                // safari uses aborterror
                if (errorName === 'notallowederror'
                        || errorName === 'aborterror') {
                    // swallow this error because the user can still click the play button on the video element
                    return Promise.resolve();
                }
                return Promise.reject(e);
            })
            .then(() => {
                onSuccessfulPlay(elem, onErrorFn);
                return Promise.resolve();
            });
    } catch (err) {
        console.error('error calling video.play: ' + err);
        return Promise.reject();
    }
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

    let offset;
    const currentPlayOptions = instance._currentPlayOptions;
    if (currentPlayOptions) {
        offset = currentPlayOptions.transcodingOffsetTicks;
    }

    offset = offset || 0;

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
            start: (start * 10000000) + offset,
            end: (end * 10000000) + offset
        });
    }

    return ranges;
}
