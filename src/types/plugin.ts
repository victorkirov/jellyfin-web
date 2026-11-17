import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { MediaType } from '@jellyfin/sdk/lib/generated-client/models/media-type';

import { PluginType } from 'constants/pluginType';

import type { PlayOptions } from './playOptions';

export interface Plugin {
    /** The name of the plugin */
    name: string
    /** The unique identifier for the plugin */
    id: string
    /** The type of the plugin */
    type: PluginType | string
    /** The priority of the plugin, used to determine the order of execution */
    priority?: number
}

export abstract class PlayerPlugin implements Plugin {
    type = PluginType.MediaPlayer;
    /** The name of the plugin */
    abstract name: string;
    /** The unique identifier for the plugin */
    abstract id: string;
    /** The priority of the plugin, used to determine the order of execution */
    priority?: number;
    /** Indicates if the player is a local player */
    isLocalPlayer?: boolean;
}

export interface InterceptOptions extends PlayOptions {
    /** The item being played */
    item: BaseItemDto
    /** The media type of the item */
    mediaType?: MediaType
}

export abstract class PreplayInterceptPlugin implements Plugin {
    type = PluginType.PreplayIntercept;
    /** The name of the plugin */
    abstract name: string;
    /** The unique identifier for the plugin */
    abstract id: string;
    /** The priority of the plugin, used to determine the order of execution */
    priority?: number;

    /**
     * The function called prior to playback starting.
     * Returning a rejected promise will prevent playback from starting, while a resolved promise will allow it to proceed.
     */
    abstract intercept(options: InterceptOptions): Promise<void>;
}

/** Capabilities exposed by legacy plugins, including optional media operations. */
export type PlaybackCandidate = {
    Id?: string | null;
    MediaType?: string | null;
    Url?: string | null;
};

export type RegistryPlugin = Plugin & {
    packageName?: string;
    installUrl?: string;
    baseUrl?: string;
    supportsAnonymous?: boolean;
    getTranslations?: () => { lang: string; path: string }[];
    canPlayMediaType?: (mediaType?: string | null) => boolean;
    canPlayItem?: (item: PlaybackCandidate) => boolean;
    canPlayUrl?: (url: string) => boolean;
    load?: () => Promise<RegistryPlugin>;
    show?: () => void | Promise<void>;
    hide?: () => void | Promise<void>;
};

export type PluginConstructor = new (dependencies?: Record<string, unknown>) => RegistryPlugin;
export type PluginSpec = string | Promise<{ default: PluginConstructor }>;

/** Operations consumed by the legacy playback facade; optional methods are feature-tested. */
export type PlaybackPlayer = {
    name: string;
    id: string;
    priority?: number;
    isLocalPlayer?: boolean;
    streamInfo?: import('lib/playback/types').PlaybackStreamInfo | null;
    isChangingStream?: boolean;
    maxStreamingBitrate?: number;
    audioStreamIndex?: number | null;
    subtitleStreamIndex?: number | null;
    secondarySubtitleStreamIndex?: number | null;
    currentState?: object;
    _progressInterval?: ReturnType<typeof setInterval> | null;
    useServerPlaybackInfoForAudio?: boolean;
    useFullSubtitleUrls?: boolean;
    supportsProgress?: boolean;
    supports: (capability: string) => boolean;
    canPlayMediaType: (mediaType?: string | null) => boolean;
    canPlayUrl?: (url: string) => boolean;
    canPlayItem?: (item: import('lib/playback/types').PlaybackItem, options?: import('lib/playback/types').PlaybackOptions) => boolean;
    getDeviceProfile: (item: import('lib/playback/types').PlaybackItem | null | undefined, options?: { isRetry?: boolean }) => Promise<import('@jellyfin/sdk/lib/generated-client/models/device-profile').DeviceProfile>;
    play: (options: import('lib/playback/types').PlaybackStreamInfo | import('lib/playback/types').PlaybackOptions) => Promise<unknown>;
    stop: (destroy?: boolean, notify?: boolean) => Promise<unknown>;
    destroy: () => void;
    duration: () => number;
    currentTime: (milliseconds?: number) => number;
    paused: () => boolean;
    isMuted: () => boolean;
    getVolume: () => number;
    setVolume: (value: number) => void;
    currentSrc?: () => string | null;
    getRepeatMode?: () => string;
    getPlaybackRate?: () => number;
    getPlaylist?: () => Promise<import('lib/playback/types').PlaybackItem[]>;
    getPlaylistSync?: () => import('lib/playback/types').PlaybackItem[];
    getTargets?: () => Promise<import('lib/playback/types').PlaybackTarget[]>;
    tryPair?: (target: import('lib/playback/types').PlaybackTarget) => Promise<unknown>;
    currentItem?: () => import('lib/playback/types').PlaybackItem | null;
    currentMediaSource?: () => import('lib/playback/types').PlaybackMediaSource | null;
    playMethod?: () => string | null;
    playSessionId?: () => string | null;
    isPlaying?: (mediaType?: string | null) => boolean;
    enableMediaProbe?: (item: import('lib/playback/types').PlaybackItem) => boolean;
    supportsPlayMethod?: (method: string, item: import('lib/playback/types').PlaybackItem) => boolean;
    getDirectPlayProtocols?: () => string[];
    setAspectRatio?: (value: string) => void;
    getSupportedAspectRatios?: () => { name: string; id: string }[];
    getAspectRatio?: () => string;
    getSupportedPlaybackRates?: () => { name: string; id: number }[];
    setBrightness?: (value: number) => void;
    getBrightness?: () => number;
    volumeUp?: (step?: number) => void;
    volumeDown?: (step?: number) => void;
    volume?: (value?: number) => number;
    changeAudioStream?: () => void;
    changeSubtitleStream?: () => void;
    getAudioStreamIndex?: () => number | null;
    setAudioStreamIndex?: (index: number) => void;
    canSetAudioStreamIndex?: () => boolean;
    getMaxStreamingBitrate?: () => number;
    enableAutomaticBitrateDetection?: () => boolean;
    setMaxStreamingBitrate?: (options: { maxBitrate?: number }) => void;
    isFullscreen?: () => boolean;
    toggleFullscreen?: () => void;
    togglePictureInPicture?: () => void;
    toggleAirPlay?: () => void;
    getSubtitleStreamIndex?: () => number | null;
    getSecondarySubtitleStreamIndex?: () => number | null;
    setSubtitleStreamIndex?: (index: number) => void;
    setSecondarySubtitleStreamIndex?: (index: number) => void;
    enableShowingSubtitleOffset?: () => void;
    disableShowingSubtitleOffset?: () => void;
    isShowingSubtitleOffsetEnabled?: () => boolean;
    setSubtitleOffset?: (value: number) => void;
    getSubtitleOffset?: () => number;
    seek?: (ticks: number) => void;
    seekRelative?: (ticks?: number) => void;
    seekable?: () => boolean;
    getPlayerState?: () => import('lib/playback/types').PlaybackState;
    setCurrentPlaylistItem?: (id: string) => void;
    removeFromPlaylist?: (ids: string[]) => void;
    movePlaylistItem?: (id: string, index: number) => void;
    getCurrentPlaylistIndex?: () => number;
    getCurrentPlaylistItemId?: () => string | null;
    nextTrack?: () => void;
    previousTrack?: () => void;
    queueNext?: (items: import('lib/playback/types').PlaybackItem[] | { items: import('lib/playback/types').PlaybackItem[] }) => void;
    queue?: (items: import('lib/playback/types').PlaybackItem[] | { items: import('lib/playback/types').PlaybackItem[] }) => void;
    playbackStartTime?: () => number;
    nextItem?: () => Promise<import('lib/playback/types').PlaybackItem>;
    setMute?: (muted: boolean) => void;
    toggleMute?: () => void;
    fastForward?: (milliseconds?: number) => void;
    rewind?: (milliseconds?: number) => void;
    playTrailers?: (item: import('lib/playback/types').PlaybackItem) => Promise<unknown>;
    getBufferedRanges?: () => { start: number; end: number }[];
    playPause?: () => void;
    pause?: () => void;
    unpause?: () => void;
    setPlaybackRate?: (value: number) => void;
    instantMix?: (item: import('lib/playback/types').PlaybackItem) => void;
    shuffle?: (item: import('lib/playback/types').PlaybackItem) => void;
    audioTracks?: () => import('@jellyfin/sdk/lib/generated-client/models/media-stream').MediaStream[];
    subtitleTracks?: () => import('@jellyfin/sdk/lib/generated-client/models/media-stream').MediaStream[];
    setRepeatMode?: (mode: string) => void;
    setQueueShuffleMode?: (mode: string) => void;
    getQueueShuffleMode?: () => string;
    clearQueue?: (clearCurrentItem: boolean) => void;
    displayContent?: (options: object) => void;
    beginPlayerUpdates?: () => void;
    endPlayerUpdates?: () => void;
    sendCommand?: (command: object) => void;
};
