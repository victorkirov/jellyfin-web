import * as userSettings from 'scripts/settings/userSettings';
import type { LibraryApiGetLatestMediaRequest } from '@jellyfin/sdk/lib/generated-client/api/library-api';
import type { ShowApiGetNextUpRequest } from '@jellyfin/sdk/lib/generated-client/api/show-api';
import type { LibraryResult } from '../libraryControllerTypes';
import type { RecommendedParams } from '../recommendedTypes';
import { getNextUpQuery } from 'lib/queries/nextUp';
import { getLatestMediaQuery } from 'lib/queries/latestMedia';
import ServerConnections from 'lib/jellyfin-apiclient/ServerConnections';
import { queryClient } from 'utils/query/queryClient';
import autoFocuser from 'components/autoFocuser';
import cardBuilder from 'components/cardbuilder/cardBuilder';
import { getBackdropShape } from 'components/cardbuilder/utils/shape';
import layoutManager from 'lib/layoutManager';
import loading from 'components/loading/loading';
import dom from 'utils/dom';
import globalize from 'lib/globalize';
import libraryMenu from 'scripts/libraryMenu';
import { LibraryTab } from 'types/libraryTab';

export function getTabs() {
    return [{
        name: globalize.translate('Shows')
    }, {
        name: globalize.translate('Suggestions')
    }, {
        name: globalize.translate('TabUpcoming')
    }, {
        name: globalize.translate('Genres')
    }, {
        name: globalize.translate('TabNetworks')
    }, {
        name: globalize.translate('Episodes')
    }];
}

export function getDefaultTabIndex(folderId?: string) {
    switch (userSettings.get('landing-' + folderId)) {
        case LibraryTab.Suggestions:
            return 1;

        case LibraryTab.Upcoming:
            return 2;

        case LibraryTab.Genres:
            return 3;

        case LibraryTab.Studios:
            return 4;

        case LibraryTab.Episodes:
            return 5;

        default:
            return 0;
    }
}

function setScrollClasses(elem: HTMLElement, scrollX: boolean) {
    if (scrollX) {
        elem.classList.add('hiddenScrollX');

        if (layoutManager.tv) {
            elem.classList.add('smoothScrollX');
        }

        elem.classList.add('scrollX');
        elem.classList.remove('vertical-wrap');
    } else {
        elem.classList.remove('hiddenScrollX');
        elem.classList.remove('smoothScrollX');
        elem.classList.remove('scrollX');
        elem.classList.add('vertical-wrap');
    }
}

export function initSuggestedTab(_page: HTMLElement, tabContent: HTMLElement) {
    const containers = tabContent.querySelectorAll<HTMLElement>('.itemsContainer');

    for (let i = 0, length = containers.length; i < length; i++) {
        setScrollClasses(containers[i], enableScrollX());
    }
}

export function loadSuggestionsTab(_view: HTMLElement, params: RecommendedParams, tabContent: HTMLElement) {
    const parentId = params.topParentId;
    const userId = window.ApiClient.getCurrentUserId();
    console.debug('loadSuggestionsTab');
    loadResume(tabContent, userId, parentId);
    loadLatest(tabContent, userId, parentId);
    loadNextUp(tabContent, userId);
}

function loadResume(view: HTMLElement, userId: string, parentId?: string) {
    const screenWidth = dom.getWindowSize().innerWidth;
    const options = {
        SortBy: 'DatePlayed',
        SortOrder: 'Descending',
        IncludeItemTypes: 'Episode',
        Filters: 'IsResumable',
        Limit: screenWidth >= 1600 ? 5 : 3,
        Recursive: true,
        Fields: 'PrimaryImageAspectRatio,MediaSourceCount',
        CollapseBoxSetItems: false,
        ParentId: parentId,
        ImageTypeLimit: 1,
        EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
        EnableTotalRecordCount: false
    };
    void window.ApiClient.getItems(userId, options).then(function (response) {
        const result = response as LibraryResult;
        if (result.Items.length) {
            view.querySelector<HTMLElement>('#resumableSection')!.classList.remove('hide');
        } else {
            view.querySelector<HTMLElement>('#resumableSection')!.classList.add('hide');
        }

        const allowBottomPadding = !enableScrollX();
        const container = view.querySelector<HTMLElement>('#resumableItems')!;
        cardBuilder.buildCards(result.Items, {
            itemsContainer: container,
            preferThumb: true,
            inheritThumb: !userSettings.useEpisodeImagesInNextUpAndResume(),
            shape: getBackdropShape(enableScrollX()),
            scalable: true,
            overlayPlayButton: true,
            allowBottomPadding: allowBottomPadding,
            cardLayout: false,
            showTitle: true,
            showYear: true,
            centerText: true
        });
        loading.hide();

        autoFocuser.autoFocus(view);
    });
}

function loadLatest(view: HTMLElement, userId: string, parentId?: string) {
    const options: LibraryApiGetLatestMediaRequest = {
        userId,
        includeItemTypes: ['Episode'],
        limit: 30,
        fields: ['PrimaryImageAspectRatio'],
        parentId,
        imageTypeLimit: 1,
        enableImageTypes: ['Primary', 'Backdrop', 'Thumb']
    };
    const api = ServerConnections.getApi(window.ApiClient.serverId());
    void queryClient.fetchQuery(getLatestMediaQuery(api, options)).then(function (items) {
        const section = view.querySelector<HTMLElement>('#latestItemsSection')!;
        const allowBottomPadding = !enableScrollX();
        const container = section.querySelector<HTMLElement>('#latestEpisodesItems')!;
        cardBuilder.buildCards(items, {
            parentContainer: section,
            itemsContainer: container,
            items: items,
            shape: 'backdrop',
            preferThumb: true,
            showTitle: true,
            showSeriesYear: true,
            showParentTitle: true,
            overlayText: false,
            cardLayout: false,
            allowBottomPadding: allowBottomPadding,
            showUnplayedIndicator: false,
            showChildCountIndicator: true,
            centerText: true,
            lazy: true,
            overlayPlayButton: true,
            lines: 2
        });
        loading.hide();

        autoFocuser.autoFocus(view);
    });
}

function loadNextUp(view: HTMLElement, userId: string) {
    const query: ShowApiGetNextUpRequest = {
        userId,
        limit: 24,
        fields: ['PrimaryImageAspectRatio', 'DateCreated', 'MediaSourceCount'],
        parentId: libraryMenu.getTopParentId() ?? undefined,
        imageTypeLimit: 1,
        enableImageTypes: ['Primary', 'Backdrop', 'Thumb'],
        enableTotalRecordCount: false
    };
    const api = ServerConnections.getApi(window.ApiClient.serverId());
    void queryClient.fetchQuery(getNextUpQuery(api, query)).then(function (response) {
        const result = response as LibraryResult;
        if (result.Items.length) {
            view.querySelector<HTMLElement>('.noNextUpItems')!.classList.add('hide');
        } else {
            view.querySelector<HTMLElement>('.noNextUpItems')!.classList.remove('hide');
        }

        const section = view.querySelector<HTMLElement>('#nextUpItemsSection')!;
        const container = section.querySelector<HTMLElement>('#nextUpItems')!;
        cardBuilder.buildCards(result.Items, {
            parentContainer: section,
            itemsContainer: container,
            preferThumb: true,
            inheritThumb: !userSettings.useEpisodeImagesInNextUpAndResume(),
            shape: 'backdrop',
            scalable: true,
            showTitle: true,
            showParentTitle: true,
            overlayText: false,
            centerText: true,
            overlayPlayButton: true,
            cardLayout: false
        });
        loading.hide();

        autoFocuser.autoFocus(view);
    });
}

function enableScrollX() {
    return true;
}

