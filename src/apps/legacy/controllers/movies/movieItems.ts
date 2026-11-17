import globalize from 'lib/globalize';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { getLibraryLayoutOptions } from '../libraryPaging';
import listView from 'components/listview/listview';
import cardBuilder from 'components/cardbuilder/cardBuilder';

export function getMovieItemsHtml(items: BaseItemDto[], viewStyle: string, sortBy?: string) {
    if (viewStyle === 'List') {
        return listView.getListViewHtml({ items, context: 'movies', sortBy: sortBy });
    }
    const cardOptions = { ...getLibraryLayoutOptions(viewStyle), items, context: 'movies', lazy: undefined as boolean | undefined, overlayPlayButton: undefined as boolean | undefined };
    if (viewStyle !== 'Poster') cardOptions.lazy = true;
    if (viewStyle === 'Poster' || viewStyle === 'Thumb') cardOptions.overlayPlayButton = true;
    return cardBuilder.getCardsHtml(cardOptions);
}

export function getMovieSortOptions() {
    return [{
        name: globalize.translate('Name'),
        id: 'SortName,ProductionYear'
    }, {
        name: globalize.translate('OptionRandom'),
        id: 'Random'
    }, {
        name: globalize.translate('OptionCommunityRating'),
        id: 'CommunityRating,SortName,ProductionYear'
    }, {
        name: globalize.translate('OptionCriticRating'),
        id: 'CriticRating,SortName,ProductionYear'
    }, {
        name: globalize.translate('OptionDateAdded'),
        id: 'DateCreated,SortName,ProductionYear'
    }, {
        name: globalize.translate('OptionDatePlayed'),
        id: 'DatePlayed,SortName,ProductionYear'
    }, {
        name: globalize.translate('OptionParentalRating'),
        id: 'OfficialRating,SortName,ProductionYear'
    }, {
        name: globalize.translate('OptionPlayCount'),
        id: 'PlayCount,SortName,ProductionYear'
    }, {
        name: globalize.translate('OptionReleaseDate'),
        id: 'PremiereDate,SortName,ProductionYear'
    }, {
        name: globalize.translate('Runtime'),
        id: 'Runtime,SortName,ProductionYear'
    }];
}
