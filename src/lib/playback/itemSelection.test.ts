import { describe, expect, it } from 'vitest';
import { getEpisodeStartIndex, getFolderPlaybackSort } from './itemSelection';
import type { PlaybackItem } from './types';

const episodes: PlaybackItem[] = [
    { Id: 'a', SeasonId: 'first', UserData: { Key: 'test', Played: false } },
    { Id: 'b', SeasonId: 'second', UserData: { Key: 'test', Played: true } },
    { Id: 'c', SeasonId: 'second', UserData: { Key: 'test', Played: false } }
];

describe('playback item selection', () => {
    it('starts with the first unwatched episode across the series', () => {
        expect(getEpisodeStartIndex(episodes)).toBe(0);
    });

    it('keeps a selected season when multiple seasons were passed', () => {
        expect(getEpisodeStartIndex(episodes, 'second', true)).toBe(2);
    });

    it('restarts an entirely watched selected season at its first episode', () => {
        expect(getEpisodeStartIndex(episodes.map(episode => ({ ...episode, UserData: { Key: 'test', Played: true } })), 'second', true)).toBe(1);
    });

    it('falls back to the beginning when no matching season or episode exists', () => {
        expect(getEpisodeStartIndex(episodes, 'missing', true)).toBe(0);
        expect(getEpisodeStartIndex([])).toBe(0);
    });

    it('preserves folder ordering and shuffle precedence', () => {
        expect(getFolderPlaybackSort({ Type: 'BoxSet', MediaType: 'Audio' })).toBeNull();
        expect(getFolderPlaybackSort({ Type: 'BoxSet' }, true)).toBe('Random');
        expect(getFolderPlaybackSort({ MediaType: 'Audio' })).toBe('Album,ParentIndexNumber,IndexNumber,SortName');
        expect(getFolderPlaybackSort({ CollectionType: 'music' })).toBe('Album,ParentIndexNumber,IndexNumber,SortName');
        expect(getFolderPlaybackSort({ MediaType: 'Video' })).toBe('SortName');
    });
});
