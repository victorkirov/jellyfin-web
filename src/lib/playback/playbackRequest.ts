import type { PlaybackInfoDto } from '@jellyfin/sdk/lib/generated-client/models/playback-info-dto';
import type { PlaybackOptions } from './types';

export function createPlaybackRequest(userId: string, options: PlaybackOptions, mediaSourceId?: string | null, liveStreamId?: string | null) {
    const query: PlaybackInfoDto & { SecondarySubtitleStreamIndex?: number | null; IsPlayback?: boolean; EnableMediaProbe?: boolean; DirectPlayProtocols?: string[]; ItemId?: string; PlaySessionId?: string | null } = {
        UserId: userId,
        StartTimeTicks: options.startPosition || 0
    };

    if (options.isPlayback) {
        query.IsPlayback = true;
        query.AutoOpenLiveStream = true;
    } else {
        query.IsPlayback = false;
        query.AutoOpenLiveStream = false;
    }

    if (options.audioStreamIndex != null) {
        query.AudioStreamIndex = options.audioStreamIndex;
    }
    if (options.subtitleStreamIndex != null) {
        query.SubtitleStreamIndex = options.subtitleStreamIndex;
    }
    if (options.secondarySubtitleStreamIndex != null) {
        query.SecondarySubtitleStreamIndex = options.secondarySubtitleStreamIndex;
    }
    if (options.enableDirectPlay != null) {
        query.EnableDirectPlay = options.enableDirectPlay;
    }
    if (options.enableDirectStream != null) {
        query.EnableDirectStream = options.enableDirectStream;
    }
    if (options.allowVideoStreamCopy != null) {
        query.AllowVideoStreamCopy = options.allowVideoStreamCopy;
    }
    if (options.allowAudioStreamCopy != null) {
        query.AllowAudioStreamCopy = options.allowAudioStreamCopy;
    }
    if (mediaSourceId) {
        query.MediaSourceId = mediaSourceId;
    }
    if (liveStreamId) {
        query.LiveStreamId = liveStreamId;
    }
    if (options.maxBitrate) {
        query.MaxStreamingBitrate = options.maxBitrate;
    }
    return query;
}
