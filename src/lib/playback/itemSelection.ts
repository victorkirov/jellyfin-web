import type { PlaybackItem } from './types';

export function getFolderPlaybackSort(item: PlaybackItem, shuffle?: boolean) {
    if (shuffle) return 'Random';
    if (item.Type === 'BoxSet') return null;
    if (item.CollectionType === 'music' || item.MediaType === 'Audio') {
        return 'Album,ParentIndexNumber,IndexNumber,SortName';
    }
    return 'SortName';
}

export function getEpisodeStartIndex(episodes: PlaybackItem[], seasonId?: string | null, restrictSeason = false) {
    let seasonStartIndex: number | undefined;
    for (let index = 0; index < episodes.length; index++) {
        const episode = episodes[index];
        if (restrictSeason && episode.SeasonId != seasonId) continue;
        if (restrictSeason && seasonStartIndex === undefined) seasonStartIndex = index;
        if (!episode.UserData!.Played) return index;
    }
    return seasonStartIndex || 0;
}
