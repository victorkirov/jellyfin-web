import type { DeviceProfile } from '@jellyfin/sdk/lib/generated-client/models/device-profile';
import type { MediaStream } from '@jellyfin/sdk/lib/generated-client/models/media-stream';
import type { PlaybackItem, PlaybackMediaSource, PlaybackStreamInfo } from 'lib/playback/types';

// The playback manager supplies these fields before invoking a local player.
export type PlayerStream = MediaStream & { realDeliveryMethod?: MediaStream['DeliveryMethod'] };
export type PlayerOptions = Omit<PlaybackStreamInfo, 'mediaSource' | 'item' | 'url'> & {
    url: string;
    item: PlaybackItem;
    mediaSource: PlaybackMediaSource & { MediaStreams: PlayerStream[] };
};
export type PlayerProfile = DeviceProfile & {
    CodecProfiles: NonNullable<DeviceProfile['CodecProfiles']>;
    TranscodingProfiles: NonNullable<DeviceProfile['TranscodingProfiles']>;
};
export type BrowserDetection = typeof import('../scripts/browser').default & {
    chrome?: boolean;
    opera?: boolean;
    android?: boolean;
    iphone?: boolean;
    iPad?: boolean;
    iosVersion?: number;
};
