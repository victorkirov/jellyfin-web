import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ImageType } from '@jellyfin/sdk/lib/generated-client/models/image-type';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import { getStudioApi } from '@jellyfin/sdk/lib/utils/api/studio-api';

import cardBuilder from 'components/cardbuilder/cardBuilder';
import type { ApiClient } from 'jellyfin-apiclient';
import type { ItemDto } from 'types/base/models/item-dto';
import type { BaseItemDtoQueryResult } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto-query-result';
import { getFullFavoriteSections, getFavoriteCardOptions, type FavoriteSection } from 'components/favoriteSectionCatalog';
import { createLibraryInitialFocus } from './libraryRail';
import layoutManager from 'lib/layoutManager';
import { appRouter } from 'components/router/appRouter';
import dom from 'utils/dom';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';

import 'components/itemscontainer/emby-itemscontainer';
import 'elements/emby-scroller/emby-scroller';

function getFetchDataFn(section: FavoriteSection) {
    return function (this: FavoritesTab) {
        const apiClient = this.apiClient!;
        const options: Record<string, string | number | boolean> = {
            SortBy: [ItemSortBy.SeriesSortName, ItemSortBy.SortName].join(','),
            SortOrder: 'Ascending',
            Filters: 'IsFavorite',
            Recursive: true,
            Fields: 'PrimaryImageAspectRatio',
            CollapseBoxSetItems: false,
            ExcludeLocationTypes: 'Virtual',
            EnableTotalRecordCount: false
        };
        options.Limit = 20;
        const userId = apiClient.getCurrentUserId();

        if (section.types === BaseItemKind.Studio) {
            const api = ServerConnections.getApi(apiClient.serverId());
            if (!api) {
                console.error('[Favorites] no Api instance available for server', apiClient.serverId());
                return Promise.resolve(undefined);
            }

            return getStudioApi(api)
                .getStudios({
                    userId,
                    isFavorite: true,
                    fields: [ItemFields.PrimaryImageAspectRatio],
                    enableImageTypes: [ImageType.Thumb],
                    enableTotalRecordCount: false,
                    limit: options.Limit
                })
                .then(({ data }) => data);
        }

        if (section.types === 'MusicArtist') {
            return apiClient.getArtists(userId, options);
        }

        if (section.types === 'Person') {
            return apiClient.getPeople(userId, options);
        }

        options.IncludeItemTypes = section.types;
        return apiClient.getItems(userId, options);
    };
}

function getRouteUrl(section: FavoriteSection, serverId: string) {
    return appRouter.getRouteUrl('list', {
        serverId: serverId,
        itemTypes: section.types,
        isFavorite: true
    });
}

function getItemsHtmlFn(section: FavoriteSection) {
    return function (this: FavoritesTab, items: ItemDto[]) {
        const serverId = this.apiClient!.serverId();
        const leadingButtons = layoutManager.tv ? [{
            name: globalize.translate('All'),
            id: 'more',
            icon: 'favorite',
            routeUrl: getRouteUrl(section, serverId)
        }] : null;
        let lines = 0;

        if (section.showTitle) {
            lines++;
        }

        if (section.showYear) {
            lines++;
        }

        if (section.showParentTitle) {
            lines++;
        }

        return cardBuilder.getCardsHtml({
            items: items,
            ...getFavoriteCardOptions(section),
            showYear: section.showYear,
            leadingButtons: leadingButtons,
            lines: lines
        });
    };
}

function createSections(instance: FavoritesTab, elem: HTMLElement, apiClient: ApiClient) {
    const sections = getFullFavoriteSections();
    let html = '';

    for (const section of sections) {
        let sectionClass = 'verticalSection';

        if (!section.showTitle) {
            sectionClass += ' verticalSection-extrabottompadding';
        }

        html += '<div class="' + sectionClass + ' hide">';
        html += '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left">';

        if (layoutManager.tv) {
            html += '<h2 class="sectionTitle sectionTitle-cards">' + globalize.translate(section.name) + '</h2>';
        } else {
            html += '<a is="emby-linkbutton" href="' + getRouteUrl(section, apiClient.serverId()) + '" class="more button-flat button-flat-mini sectionTitleTextButton">';
            html += '<h2 class="sectionTitle sectionTitle-cards">';
            html += globalize.translate(section.name);
            html += '</h2>';
            html += '<span class="material-icons chevron_right" aria-hidden="true"></span>';
            html += '</a>';
        }

        html += '</div>';
        html += '<div is="emby-scroller" class="padded-top-focusscale padded-bottom-focusscale" data-centerfocus="true"><div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x" data-monitor="markfavorite"></div></div>';
        html += '</div>';
    }

    html += '<p class="noFavoritesMessage hide padded-left padded-right">' + globalize.translate('LibraryNoFavorites') + '</p>';
    elem.innerHTML = html;
    (window as unknown as Window & { CustomElements: { upgradeSubtree: (element: Element) => void } }).CustomElements.upgradeSubtree(elem);

    const elems = elem.querySelectorAll<FavoriteItemsContainer>('.itemsContainer');

    for (let i = 0, length = elems.length; i < length; i++) {
        const itemsContainer = elems[i];
        itemsContainer.fetchData = getFetchDataFn(sections[i]).bind(instance);
        itemsContainer.getItemsHtml = getItemsHtmlFn(sections[i]).bind(instance);
        itemsContainer.parentContainer = dom.parentWithClass(itemsContainer, 'verticalSection');
    }
}

type FavoriteResumeOptions = { autoFocus?: boolean };
type FavoriteItemsContainer = HTMLElement & {
    fetchData: (() => Promise<BaseItemDtoQueryResult | undefined>) | null;
    getItemsHtml: ((items: ItemDto[]) => string) | null;
    parentContainer: Element | null;
    resume: (options: FavoriteResumeOptions) => Promise<void>;
    pause: () => void;
};

class FavoritesTab {
    view: HTMLElement | null;
    params: unknown;
    apiClient: ApiClient | null | undefined;
    sectionsContainer: HTMLElement | null;
    private initialFocus?: ReturnType<typeof createLibraryInitialFocus>;

    constructor(view: HTMLElement, params: unknown) {
        this.view = view;
        this.params = params;
        this.apiClient = ServerConnections.currentApiClient();
        this.sectionsContainer = view.querySelector<HTMLElement>('.sections')!;
        createSections(this, this.sectionsContainer, this.apiClient!);
    }

    onResume(options: FavoriteResumeOptions) {
        const promises = [];
        const view = this.view!;
        this.initialFocus?.cancel();
        const focus = this.initialFocus = createLibraryInitialFocus(view.closest<HTMLElement>('.page') || view, view);
        const elems = this.sectionsContainer!.querySelectorAll<FavoriteItemsContainer>('.itemsContainer');

        for (const elem of elems) {
            promises.push(elem.resume(options));
        }

        return Promise.all(promises).then(function () {
            const empty = !view.querySelector('.itemsContainer .card,.itemsContainer .listItem');
            view.querySelector('.noFavoritesMessage')?.classList.toggle('hide', !empty);
            if (options.autoFocus || empty) focus();
            else focus.cancel();
        }).catch(error => {
            focus.cancel();
            console.error(error);
        });
    }

    onPause() {
        this.initialFocus?.cancel();
        if (this.sectionsContainer) {
            Array.from(this.sectionsContainer!.querySelectorAll<FavoriteItemsContainer>('.itemsContainer'))
                .forEach(e => { e.pause(); });
        }
    }

    destroy() {
        this.initialFocus?.cancel();
        this.view = null;
        this.params = null;
        this.apiClient = null;
        const elems = this.sectionsContainer!.querySelectorAll<FavoriteItemsContainer>('.itemsContainer');

        for (const elem of elems) {
            elem.fetchData = null;
            elem.getItemsHtml = null;
            elem.parentContainer = null;
        }

        this.sectionsContainer = null;
    }
}

export default FavoritesTab;
