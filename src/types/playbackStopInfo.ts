import type {
    BaseItemDto,
    GroupShuffleMode,
    MediaSourceInfo,
    MediaType,
    PlayerStateInfo
} from '@jellyfin/sdk/lib/generated-client';

import type { ItemDto } from 'types/base/models/item-dto';
import type { PlaybackPlayer } from 'types/plugin';

export interface BufferedRange {
    start?: number;
    end?: number;
}

export interface PlayState extends PlayerStateInfo {
    ShuffleMode?: GroupShuffleMode;
    MaxStreamingBitrate?: number | null;
    PlaybackStartTimeTicks?: number | null;
    PlaybackRate?: number | null;
    SecondarySubtitleStreamIndex?: number | null;
    BufferedRanges?: BufferedRange[];
    PlaySessionId?: string | null;
    PlaylistItemId?: string | null;
}

export interface MediaSource extends MediaSourceInfo {
    enableDirectPlay?: boolean;
    DefaultSecondarySubtitleStreamIndex?: number | null;
    StreamUrl?: string | null;
    albumNormalizationGain?: number | null;
}

export interface PlayerState {
    PlayState: PlayState;
    NowPlayingItem: ItemDto | null;
    NextItem: BaseItemDto | null;
    NextMediaType: MediaType | null;
    MediaSource: MediaSource | null;
}

export interface PlaybackStopInfo {
    player: PlaybackPlayer;
    state: PlayerState;
    nextItem: BaseItemDto | null;
    nextMediaType: MediaType | null;
}

