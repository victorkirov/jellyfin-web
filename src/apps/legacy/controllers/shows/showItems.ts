import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { getLibraryLayoutOptions } from '../libraryPaging';
import globalize from 'lib/globalize';
import listView from 'components/listview/listview';
import cardBuilder from 'components/cardbuilder/cardBuilder';

export function getShowItemsHtml(items: BaseItemDto[] | undefined, viewStyle: string, sortBy?: string) {
    let html;
    if (viewStyle === 'List') {
        html = listView.getListViewHtml({ items: items, context: 'tvshows', sortBy: sortBy });
    } else {
        const cardOptions: { showYear?: boolean; lazy?: boolean; overlayMoreButton?: boolean } & Record<string, unknown> = { ...getLibraryLayoutOptions(viewStyle), items: items, context: 'tvshows' };
        if (viewStyle === 'Thumb') delete cardOptions.showYear;
        if (viewStyle === 'Poster') cardOptions.lazy = true;
        if (viewStyle === 'Poster' || viewStyle === 'Thumb') cardOptions.overlayMoreButton = true;
        html = cardBuilder.getCardsHtml(cardOptions);
    }

    return html;
}

export function getShowSortOptions() {
    return [{
        name: globalize.translate('Name'),
        id: 'SortName'
    }, {
        name: globalize.translate('OptionRandom'),
        id: 'Random'
    }, {
        name: globalize.translate('OptionCommunityRating'),
        id: 'CommunityRating,SortName'
    }, {
        name: globalize.translate('OptionDateShowAdded'),
        id: 'DateCreated,SortName'
    }, {
        name: globalize.translate('OptionDateEpisodeAdded'),
        id: 'DateLastContentAdded,SortName'
    }, {
        name: globalize.translate('OptionDatePlayed'),
        id: 'SeriesDatePlayed,SortName'
    }, {
        name: globalize.translate('OptionParentalRating'),
        id: 'OfficialRating,SortName'
    }, {
        name: globalize.translate('OptionReleaseDate'),
        id: 'PremiereDate,SortName'
    }];
}
