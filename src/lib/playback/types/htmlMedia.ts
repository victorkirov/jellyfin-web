import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client/models/media-source-info';

export type MediaPlayOptions = {
    mediaSource?: MediaSourceInfo & { IsLocal?: boolean };
    url?: string;
    playerStartPositionTicks?: number;
    transcodingOffsetTicks?: number;
};

type UnloadablePlayer = { unload: () => void };

export type MediaInstance = {
    _mediaElement?: HTMLMediaElement;
    destroyCustomTrack?: (element?: HTMLMediaElement) => void;
    _castPlayer?: UnloadablePlayer | null;
    _flvPlayer?: (UnloadablePlayer & { detachMediaElement: () => void; destroy: () => void }) | null;
    _currentSrc?: string | null;
    _currentTime?: number | null;
    _currentPlayOptions?: MediaPlayOptions | null;
};

// Keep the dormant UWP adapter typed without requiring Windows globals on TV.
export type WindowsMediaAdapter = {
    Storage: { StorageFile: { getFileFromPathAsync: (path?: string) => Promise<unknown> } };
    Media: {
        Playback: {
            MediaPlaybackList: new () => { items: { append: (item: unknown) => void } };
            MediaPlaybackItem: new (source: unknown, startTimeMs: number) => unknown;
        };
        Core: { MediaSource: { createFromStorageFile: (file: unknown) => unknown } };
    };
};
