import { describe, expect, it } from 'vitest';
import { createPlaybackRequest } from './playbackRequest';

describe('playback request options', () => {
    it('preserves explicit zero selections and disabled stream-copy flags', () => {
        expect(createPlaybackRequest('user', {
            startPosition: 0, audioStreamIndex: 0, subtitleStreamIndex: -1,
            secondarySubtitleStreamIndex: 0, enableDirectPlay: false,
            enableDirectStream: false, allowVideoStreamCopy: false, allowAudioStreamCopy: false
        })).toEqual({
            UserId: 'user', StartTimeTicks: 0, IsPlayback: false, AutoOpenLiveStream: false,
            AudioStreamIndex: 0, SubtitleStreamIndex: -1, SecondarySubtitleStreamIndex: 0,
            EnableDirectPlay: false, EnableDirectStream: false, AllowVideoStreamCopy: false, AllowAudioStreamCopy: false
        });
    });

    it('adds negotiated source and live-stream identities for a playing request', () => {
        expect(createPlaybackRequest('user', { isPlayback: true, startPosition: 123, maxBitrate: 456 }, 'source', 'live')).toEqual({
            UserId: 'user', StartTimeTicks: 123, IsPlayback: true, AutoOpenLiveStream: true,
            MediaSourceId: 'source', LiveStreamId: 'live', MaxStreamingBitrate: 456
        });
    });

    it('leaves absent and null overrides to the server defaults', () => {
        expect(createPlaybackRequest('user', {
            audioStreamIndex: null, subtitleStreamIndex: null, enableDirectPlay: null, maxBitrate: 0
        })).toEqual({ UserId: 'user', StartTimeTicks: 0, IsPlayback: false, AutoOpenLiveStream: false });
    });
});
