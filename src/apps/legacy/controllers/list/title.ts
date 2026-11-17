import globalize from 'lib/globalize';
import type { ItemDto } from 'types/base/models/item-dto';
import type { ListParams } from './types';

const titles: Record<string, string> = {
    Movie: 'Movies', Series: 'Shows', Season: 'Seasons', Episode: 'Episodes',
    MusicArtist: 'Artists', MusicAlbum: 'Albums', Audio: 'Songs', Video: 'Videos'
};

function getProgramsTitle(params: ListParams) {
    if (params.IsMovie === 'true') return 'Movies';
    if (params.IsSports === 'true') return 'Sports';
    if (params.IsKids === 'true') return 'HeaderForKids';
    if (params.IsAiring === 'true') return 'HeaderOnNow';
    if (params.IsSeries === 'true') return 'Shows';
    if (params.IsNews === 'true') return 'News';
    return 'Programs';
}

export function getTitle(params: ListParams, item: ItemDto | null) {
    if (params.type === 'Recordings') return globalize.translate('Recordings');
    if (params.type === 'Programs') return globalize.translate(getProgramsTitle(params));
    if (params.type === 'nextup') return globalize.translate('NextUp');
    if (params.type === 'favoritemovies') return globalize.translate('FavoriteMovies');
    if (item) return item.Name;
    const titleKey = params.type ? titles[params.type] : undefined;
    if (titleKey) return globalize.translate(titleKey);
    if (params.tag) return params.tag;
}
