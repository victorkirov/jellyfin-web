import { describe, expect, it } from 'vitest';
import { MediaStreamType } from '@jellyfin/sdk/lib/generated-client/models/media-stream-type';
import { autoSetNextTracks } from './trackSelection';
import type { PlaybackMediaSource, TrackSelection } from './types';

const previous: PlaybackMediaSource = {
    DefaultAudioStreamIndex: 0,
    DefaultSubtitleStreamIndex: 1,
    DefaultSecondarySubtitleStreamIndex: -1,
    MediaStreams: [
        { Index: 0, Type: MediaStreamType.Audio, Codec: 'aac', Language: 'eng', DisplayTitle: 'English' },
        { Index: 1, Type: MediaStreamType.Subtitle, Codec: 'srt', Language: 'eng', DisplayTitle: 'English' }
    ]
};

describe('track selections across playback sources', () => {
    it('matches remembered tracks by language, title and relative position', () => {
        const selection: TrackSelection = {};
        autoSetNextTracks(previous, [
            { Index: 4, Type: MediaStreamType.Audio, Codec: 'aac', Language: 'eng', DisplayTitle: 'English' },
            { Index: 9, Type: MediaStreamType.Subtitle, Codec: 'srt', Language: 'eng', DisplayTitle: 'English' }
        ], selection, true, true);
        expect(selection).toEqual({ DefaultAudioStreamIndex: 4, DefaultSubtitleStreamIndex: 9, DefaultSecondarySubtitleStreamIndex: -1 });
    });

    it('treats omitted and null codecs alike when matching remembered tracks', () => {
        const selection: TrackSelection = {};
        autoSetNextTracks({
            DefaultAudioStreamIndex: 0,
            MediaStreams: [{ Index: 0, Type: MediaStreamType.Audio, Codec: null, Language: 'eng' }]
        }, [
            { Index: 0, Type: MediaStreamType.Audio, Codec: 'aac', Language: 'fra' },
            { Index: 1, Type: MediaStreamType.Audio, Language: 'eng' }
        ], selection, true, false);
        expect(selection.DefaultAudioStreamIndex).toBe(1);
    });

    it('keeps subtitles off and respects disabled remembered audio selections', () => {
        const selection: TrackSelection = {};
        autoSetNextTracks({ ...previous, DefaultSubtitleStreamIndex: -1 }, previous.MediaStreams, selection, false, true);
        expect(selection).toEqual({ DefaultSubtitleStreamIndex: -1, DefaultSecondarySubtitleStreamIndex: -1 });
    });

    it('leaves defaults untouched without a sufficiently similar stream', () => {
        const selection: TrackSelection = { DefaultAudioStreamIndex: 5 };
        autoSetNextTracks(previous, [{ Index: 5, Type: MediaStreamType.Audio, Codec: 'ac3', Language: 'fra' }], selection, true, false);
        expect(selection).toEqual({ DefaultAudioStreamIndex: 5 });
    });

    it('does not alter selections when either source has no streams', () => {
        const selection: TrackSelection = {};
        autoSetNextTracks(null, [], selection, true, true);
        autoSetNextTracks(previous, null, selection, true, true);
        expect(selection).toEqual({});
    });
});
