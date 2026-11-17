import * as userSettings from 'scripts/settings/userSettings';
import type { LibraryApiGetLatestMediaRequest } from '@jellyfin/sdk/lib/generated-client/api/library-api';
import type { LibraryResult } from '../libraryControllerTypes';
import { getLatestMediaQuery } from 'lib/queries/latestMedia';
import ServerConnections from 'lib/jellyfin-apiclient/ServerConnections';
import { queryClient } from 'utils/query/queryClient';
import cardBuilder from 'components/cardbuilder/cardBuilder';
import { getSquareShape } from 'components/cardbuilder/utils/shape';
import imageLoader from 'components/images/imageLoader';
import loading from 'components/loading/loading';
import dom from 'utils/dom';
import globalize from 'lib/globalize';
import { LibraryTab } from 'types/libraryTab';

function itemsPerRow() {
    const screenWidth = dom.getWindowSize().innerWidth;

    if (screenWidth >= 1920) {
        return 9;
    }

    if (screenWidth >= 1200) {
        return 12;
    }

    if (screenWidth >= 1000) {
        return 10;
    }

    return 8;
}

export function enableScrollX() {
    return true;
}

function loadLatest(page: HTMLElement, parentId?: string) {
    loading.show();
    const userId = window.ApiClient.getCurrentUserId();
    const options: LibraryApiGetLatestMediaRequest = {
        userId,
        includeItemTypes: ['Audio'],
        limit: enableScrollX() ? 3 * itemsPerRow() : 2 * itemsPerRow(),
        fields: ['PrimaryImageAspectRatio'],
        parentId,
        imageTypeLimit: 1,
        enableImageTypes: ['Primary', 'Backdrop', 'Banner', 'Thumb']
    };
    const api = ServerConnections.getApi(window.ApiClient.serverId());
    void queryClient.fetchQuery(getLatestMediaQuery(api, options)).then(function (items) {
        const elem = page.querySelector<HTMLElement>('#recentlyAddedSongs')!;
        elem.innerHTML = cardBuilder.getCardsHtml({
            items: items,
            showUnplayedIndicator: false,
            shape: getSquareShape(enableScrollX()),
            showTitle: true,
            showParentTitle: true,
            lazy: true,
            centerText: true,
            overlayPlayButton: true,
            allowBottomPadding: !enableScrollX(),
            cardLayout: false,
            coverImage: true
        });
        imageLoader.lazyChildren(elem);
        loading.hide();

        void import('components/autoFocuser').then(({ default: autoFocuser }) => {
            autoFocuser.autoFocus(page);
        });
    });
}

function loadRecentlyPlayed(page: HTMLElement, parentId?: string) {
    const options = {
        SortBy: 'DatePlayed',
        SortOrder: 'Descending',
        IncludeItemTypes: 'Audio',
        Limit: itemsPerRow(),
        Recursive: true,
        Fields: 'PrimaryImageAspectRatio',
        Filters: 'IsPlayed',
        ParentId: parentId,
        ImageTypeLimit: 1,
        EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
        EnableTotalRecordCount: false
    };
    void window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), options).then(function (response) {
        const result = response as LibraryResult;
        const elem = page.querySelector<HTMLElement>('#recentlyPlayed')!;

        if (result.Items.length) {
            elem.classList.remove('hide');
        } else {
            elem.classList.add('hide');
        }

        const itemsContainer = elem.querySelector<HTMLElement>('.itemsContainer')!;
        itemsContainer.innerHTML = cardBuilder.getCardsHtml({
            items: result.Items,
            showUnplayedIndicator: false,
            shape: getSquareShape(enableScrollX()),
            showTitle: true,
            showParentTitle: true,
            action: 'instantmix',
            lazy: true,
            centerText: true,
            overlayMoreButton: true,
            allowBottomPadding: !enableScrollX(),
            cardLayout: false,
            coverImage: true
        });
        imageLoader.lazyChildren(itemsContainer);
    });
}

function loadFrequentlyPlayed(page: HTMLElement, parentId?: string) {
    const options = {
        SortBy: 'PlayCount',
        SortOrder: 'Descending',
        IncludeItemTypes: 'Audio',
        Limit: itemsPerRow(),
        Recursive: true,
        Fields: 'PrimaryImageAspectRatio',
        Filters: 'IsPlayed',
        ParentId: parentId,
        ImageTypeLimit: 1,
        EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
        EnableTotalRecordCount: false
    };
    void window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), options).then(function (response) {
        const result = response as LibraryResult;
        const elem = page.querySelector<HTMLElement>('#topPlayed')!;

        if (result.Items.length) {
            elem.classList.remove('hide');
        } else {
            elem.classList.add('hide');
        }

        const itemsContainer = elem.querySelector<HTMLElement>('.itemsContainer')!;
        itemsContainer.innerHTML = cardBuilder.getCardsHtml({
            items: result.Items,
            showUnplayedIndicator: false,
            shape: getSquareShape(enableScrollX()),
            showTitle: true,
            showParentTitle: true,
            action: 'instantmix',
            lazy: true,
            centerText: true,
            overlayMoreButton: true,
            allowBottomPadding: !enableScrollX(),
            cardLayout: false,
            coverImage: true
        });
        imageLoader.lazyChildren(itemsContainer);
    });
}

export function loadSuggestionsTab(_page: HTMLElement, tabContent: HTMLElement, parentId?: string) {
    console.debug('loadSuggestionsTab');
    loadLatest(tabContent, parentId);
    loadRecentlyPlayed(tabContent, parentId);
    loadFrequentlyPlayed(tabContent, parentId);

    void import('components/favoriteitems').then(({ default: favoriteItems }) => {
        favoriteItems.render(tabContent, window.ApiClient.getCurrentUserId(), parentId, ['favoriteArtists', 'favoriteAlbums', 'favoriteSongs']);
    });
}

export function getTabs() {
    return [{
        name: globalize.translate('Albums')
    }, {
        name: globalize.translate('Suggestions')
    }, {
        name: globalize.translate('HeaderAlbumArtists')
    }, {
        name: globalize.translate('Artists')
    }, {
        name: globalize.translate('Playlists')
    }, {
        name: globalize.translate('Songs')
    }, {
        name: globalize.translate('Genres')
    }];
}

export function getDefaultTabIndex(folderId?: string) {
    switch (userSettings.get('landing-' + folderId)) {
        case LibraryTab.Suggestions:
            return 1;

        case LibraryTab.AlbumArtists:
            return 2;

        case LibraryTab.Artists:
            return 3;

        case LibraryTab.Playlists:
            return 4;

        case LibraryTab.Songs:
            return 5;

        case LibraryTab.Genres:
            return 6;

        default:
            return 0;
    }
}

