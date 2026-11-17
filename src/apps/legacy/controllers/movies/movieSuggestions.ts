import * as userSettings from 'scripts/settings/userSettings';
import type { LibraryApiGetLatestMediaRequest } from '@jellyfin/sdk/lib/generated-client/api/library-api';
import type { LibraryResult } from '../libraryControllerTypes';
import type { RecommendedParams } from '../recommendedTypes';
import { getLatestMediaQuery } from 'lib/queries/latestMedia';
import ServerConnections from 'lib/jellyfin-apiclient/ServerConnections';
import { queryClient } from 'utils/query/queryClient';
import escapeHtml from 'escape-html';

import cardBuilder from 'components/cardbuilder/cardBuilder';
import { getBackdropShape, getPortraitShape } from 'components/cardbuilder/utils/shape';
import imageLoader from 'components/images/imageLoader';
import layoutManager from 'lib/layoutManager';
import dom from 'utils/dom';
import globalize from 'lib/globalize';
import { LibraryTab } from 'types/libraryTab';

function enableScrollX() {
    return true;
}

function loadLatest(page: HTMLElement, userId: string, parentId?: string) {
    const options: LibraryApiGetLatestMediaRequest = {
        userId,
        includeItemTypes: ['Movie'],
        limit: 18,
        fields: ['PrimaryImageAspectRatio', 'MediaSourceCount'],
        parentId,
        imageTypeLimit: 1,
        enableImageTypes: ['Primary', 'Backdrop', 'Banner', 'Thumb']
    };
    const api = ServerConnections.getApi(window.ApiClient.serverId());
    void queryClient.fetchQuery(getLatestMediaQuery(api, options)).then(function (items) {
        const allowBottomPadding = !enableScrollX();
        const container = page.querySelector<HTMLElement>('#recentlyAddedItems')!;
        cardBuilder.buildCards(items, {
            itemsContainer: container,
            shape: getPortraitShape(enableScrollX()),
            scalable: true,
            overlayPlayButton: true,
            allowBottomPadding: allowBottomPadding,
            showTitle: true,
            showYear: true,
            centerText: true
        });

        // FIXME: Wait for all sections to load
        autoFocus(page);
    });
}

function loadResume(page: HTMLElement, userId: string, parentId?: string) {
    const screenWidth = dom.getWindowSize().innerWidth;
    const options = {
        SortBy: 'DatePlayed',
        SortOrder: 'Descending',
        IncludeItemTypes: 'Movie',
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
            page.querySelector<HTMLElement>('#resumableSection')!.classList.remove('hide');
        } else {
            page.querySelector<HTMLElement>('#resumableSection')!.classList.add('hide');
        }

        const allowBottomPadding = !enableScrollX();
        const container = page.querySelector<HTMLElement>('#resumableItems')!;
        cardBuilder.buildCards(result.Items, {
            itemsContainer: container,
            preferThumb: true,
            shape: getBackdropShape(enableScrollX()),
            scalable: true,
            overlayPlayButton: true,
            allowBottomPadding: allowBottomPadding,
            cardLayout: false,
            showTitle: true,
            showYear: true,
            centerText: true
        });

        // FIXME: Wait for all sections to load
        autoFocus(page);
    });
}

function getRecommendationHtml(recommendation: { RecommendationType?: string; BaselineItemName?: string | null; Items: LibraryResult['Items'] }) {
    let html = '';
    let title = '';

    // The translator historically throws when a named recommendation omits its baseline.
    switch (recommendation.RecommendationType) {
        case 'SimilarToRecentlyPlayed':
            title = globalize.translate('RecommendationBecauseYouWatched', recommendation.BaselineItemName!);
            break;

        case 'SimilarToLikedItem':
            title = globalize.translate('RecommendationBecauseYouLike', recommendation.BaselineItemName!);
            break;

        case 'HasDirectorFromRecentlyPlayed':
        case 'HasLikedDirector':
            title = globalize.translate('RecommendationDirectedBy', recommendation.BaselineItemName!);
            break;

        case 'HasActorFromRecentlyPlayed':
        case 'HasLikedActor':
            title = globalize.translate('RecommendationStarring', recommendation.BaselineItemName!);
            break;
    }

    html += '<div class="verticalSection">';
    html += '<h2 class="sectionTitle sectionTitle-cards padded-left">' + escapeHtml(title) + '</h2>';
    const allowBottomPadding = true;

    if (enableScrollX()) {
        html += '<div is="emby-scroller" class="padded-top-focusscale padded-bottom-focusscale" data-mousewheel="false" data-centerfocus="true">';
        html += '<div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x">';
    } else {
        html += '<div is="emby-itemscontainer" class="itemsContainer focuscontainer-x padded-left padded-right vertical-wrap">';
    }

    html += cardBuilder.getCardsHtml(recommendation.Items, {
        shape: getPortraitShape(enableScrollX()),
        scalable: true,
        overlayPlayButton: true,
        allowBottomPadding: allowBottomPadding,
        showTitle: true,
        showYear: true,
        centerText: true
    });

    if (enableScrollX()) {
        html += '</div>';
    }
    html += '</div>';
    html += '</div>';
    return html;
}

function loadSuggestions(page: HTMLElement, userId: string, parentId?: string) {
    const screenWidth = dom.getWindowSize().innerWidth;
    let itemLimit = 5;
    if (screenWidth >= 1600) {
        itemLimit = 8;
    } else if (screenWidth >= 1200) {
        itemLimit = 6;
    }

    const url = window.ApiClient.getUrl('Movies/Recommendations', {
        userId: userId,
        ParentId: parentId,
        categoryLimit: 6,
        ItemLimit: itemLimit,
        Fields: 'PrimaryImageAspectRatio,MediaSourceCount',
        ImageTypeLimit: 1,
        EnableImageTypes: 'Primary,Backdrop,Banner,Thumb'
    });
    void window.ApiClient.getJSON(url).then(function (recommendations: Parameters<typeof getRecommendationHtml>[0][]) {
        if (!recommendations.length) {
            page.querySelector<HTMLElement>('.noItemsMessage')!.classList.remove('hide');
            page.querySelector<HTMLElement>('.recommendations')!.innerHTML = '';
            return;
        }

        const html = recommendations.map(getRecommendationHtml).join('');
        page.querySelector<HTMLElement>('.noItemsMessage')!.classList.add('hide');
        const recs = page.querySelector<HTMLElement>('.recommendations')!;
        recs.innerHTML = html;
        imageLoader.lazyChildren(recs);

        // FIXME: Wait for all sections to load
        autoFocus(page);
    });
}

function autoFocus(page: HTMLElement) {
    void import('components/autoFocuser').then(({ default: autoFocuser }) => {
        autoFocuser.autoFocus(page);
    });
}

function setScrollClasses(elem: HTMLElement, scrollX: boolean) {
    if (scrollX) {
        elem.classList.add('hiddenScrollX');

        if (layoutManager.tv) {
            elem.classList.add('smoothScrollX');
            elem.classList.add('padded-top-focusscale');
            elem.classList.add('padded-bottom-focusscale');
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

    for (const container of containers) {
        setScrollClasses(container, enableScrollX());
    }
}

export function loadSuggestionsTab(_view: HTMLElement, params: RecommendedParams, tabContent: HTMLElement) {
    const parentId = params.topParentId;
    const userId = window.ApiClient.getCurrentUserId();
    loadResume(tabContent, userId, parentId);
    loadLatest(tabContent, userId, parentId);
    loadSuggestions(tabContent, userId, parentId);
}

export function getTabs() {
    return [{
        name: globalize.translate('Movies')
    }, {
        name: globalize.translate('Suggestions')
    }, {
        name: globalize.translate('Favorites')
    }, {
        name: globalize.translate('Collections')
    }, {
        name: globalize.translate('Genres')
    }];
}

export function getDefaultTabIndex(folderId?: string) {
    switch (userSettings.get('landing-' + folderId)) {
        case LibraryTab.Suggestions:
            return 1;

        case LibraryTab.Favorites:
            return 2;

        case LibraryTab.Collections:
            return 3;

        case LibraryTab.Genres:
            return 4;

        default:
            return 0;
    }
}

