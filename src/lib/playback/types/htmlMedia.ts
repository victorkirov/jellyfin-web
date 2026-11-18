import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client/models/media-source-info';

export type MediaPlayOptions = {
    mediaSource?: MediaSourceInfo;
    url?: string;
    playerStartPositionTicks?: number | null;
    transcodingOffsetTicks?: number;
};

type UnloadablePlayer = { unload: () => void };

export type MediaInstance = {
    _hlsPlayer?: import('hls.js').default | null;
    _hlsRequest?: { cancel: () => void } | null;
    _hlsRecovery?: { decoding?: number; swap?: number };
    _mediaElement?: HTMLMediaElement | null;
    destroyCustomTrack?: (element?: HTMLMediaElement | null) => void;
    _castPlayer?: UnloadablePlayer | null;
    _flvPlayer?: (UnloadablePlayer & { detachMediaElement: () => void; destroy: () => void }) | null;
    _currentSrc?: string | null;
    _currentTime?: number | null;
    _currentPlayOptions?: MediaPlayOptions | null;
};

