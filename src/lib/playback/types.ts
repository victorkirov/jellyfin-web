import type { ItemDto } from 'types/base/models/item-dto';
import type { DeviceProfile } from '@jellyfin/sdk/lib/generated-client/models/device-profile';
import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client/models/media-source-info';
import type { MediaStream } from '@jellyfin/sdk/lib/generated-client/models/media-stream';
import type { PlaybackPlayer } from 'types/plugin';
import type { PlayOptions } from 'types/playOptions';

export type PlaybackItem = Omit<ItemDto, 'Type' | 'MediaType' | 'MediaSources'> & {
    Type?: string;
    MediaType?: string;
    Url?: string;
    PlaylistItemId?: string;
    playOptions?: PlaybackOptions;
    PresetMediaSource?: PlaybackMediaSource;
    MediaSources?: PlaybackMediaSource[] | null;
    NormalizationGain?: number;
};

export type PlaybackMediaSource = MediaSourceInfo & {
    StreamUrl?: string;
    enableDirectPlay?: boolean;
    hasAlternateVersions?: boolean;
    albumNormalizationGain?: number;
    DefaultSecondarySubtitleStreamIndex?: number | null;
};

export type PlaybackOptions = Omit<PlayOptions, 'items'> & {
    autoplay?: boolean;
    items?: PlaybackItem[] | null;
    ids?: string[];
    serverId?: string;
    player?: string;
    secondarySubtitleStreamIndex?: number | null;
    maxBitrate?: number;
    startPosition?: number;
    isPlayback?: boolean | null;
    enableDirectPlay?: boolean | null;
    enableDirectStream?: boolean | null;
    allowVideoStreamCopy?: boolean | null;
    allowAudioStreamCopy?: boolean | null;
    shuffle?: boolean;
    enableIntros?: boolean;
    playCommand?: string;
};

export type PlaybackQuery = Record<string, string | string[] | number | boolean | null | undefined>;
export type PlaybackResult = { Items: PlaybackItem[]; TotalRecordCount?: number };
export type PlaybackTarget = { id: string; name: string; playerName?: string; isLocalPlayer?: boolean; supportedCommands?: string[]; playableMediaTypes?: boolean[] };
export type TextTrack = { url?: string | null; language: string; isDefault: boolean; index?: number; format?: string | null };
export type PlaybackStreamInfo = {
    url?: string | null;
    mimeType?: string;
    transcodingOffsetTicks?: number;
    playMethod?: string;
    playerStartPositionTicks?: number;
    item?: PlaybackItem;
    mediaSource?: PlaybackMediaSource;
    textTracks?: TextTrack[];
    tracks?: TextTrack[];
    mediaType?: string;
    liveStreamId?: string;
    playSessionId?: string;
    title?: string | null;
    backdropUrl?: string;
    fullscreen?: boolean;
    aspectRatio?: string;
    playbackStartTimeTicks?: number;
    started?: boolean;
    ended?: boolean;
    lastMediaInfoQuery?: number;
    onPlaybackStarted?: (streamInfo: PlaybackStreamInfo) => void;
    playOptions?: PlaybackOptions;
};
export type PlaybackState = {
    PlayState: {
        VolumeLevel?: number; IsMuted?: boolean; IsPaused?: boolean;
        RepeatMode?: string; ShuffleMode?: string; PlaybackOrder?: string;
        MaxStreamingBitrate?: number; PositionTicks?: number; PlaybackStartTimeTicks?: number | null;
        PlaybackRate?: number; SubtitleStreamIndex?: number | null; SecondarySubtitleStreamIndex?: number | null;
        AudioStreamIndex?: number | null; BufferedRanges?: { start: number; end: number }[];
        PlayMethod?: string | null; LiveStreamId?: string | null; PlaySessionId?: string | null;
        PlaylistItemId?: string | null; MediaSourceId?: string | null; CanSeek?: boolean;
    };
    NowPlayingItem?: PlaybackItem;
    MediaSource?: PlaybackMediaSource | null;
    IsFirstItem?: boolean;
    IsFullscreen?: boolean;
    NextMediaType?: string | null;
    NextItem?: PlaybackItem | null;
};
export type TrackSelection = Pick<PlaybackMediaSource, 'DefaultAudioStreamIndex' | 'DefaultSubtitleStreamIndex' | 'DefaultSecondarySubtitleStreamIndex'>;
export type PlaybackDeviceProfile = DeviceProfile & { CodecProfiles: NonNullable<DeviceProfile['CodecProfiles']>; TranscodingProfiles: NonNullable<DeviceProfile['TranscodingProfiles']>; DirectPlayProfiles: NonNullable<DeviceProfile['DirectPlayProfiles']> };
export type PlaybackStopState = { item: PlaybackItem; mediaSource?: PlaybackMediaSource; nextItem?: { item: PlaybackItem }; nextMediaType?: string; positionMs?: number };
export type PlaybackFailure = { streamInfo?: PlaybackStreamInfo; type?: number | string };
export type PlaybackSourceSnapshot = PlaybackMediaSource & { AudioStreamIndex?: number | null; SubtitleStreamIndex?: number | null; SecondarySubtitleStreamIndex?: number | null };
export type PlaybackMediaStream = MediaStream;
export type PlaybackPlayerState = PlaybackPlayer;
