import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { createInitialContentFocus } from '../initialContentFocus';
import { buildGenreCards, getGenreRowsHtml, type GenreOptions, type GenreParams } from './genreMarkup';
import focusManager from 'lib/focusManager';
import lazyLoader from 'components/lazyLoader/lazyLoaderIntersectionObserver';
import loading from 'components/loading/loading';
import * as userSettings from 'scripts/settings/userSettings';

import 'components/buttons/emby-button';

type GenreQuery = { SortBy: string; SortOrder: string; IncludeItemTypes: string; Recursive: boolean; EnableTotalRecordCount: boolean; ParentId?: string };
type GenreResult = { Items: BaseItemDto[] };
export type GenreTabController = {
    getViewStyles(): string[];
    getCurrentViewStyle(): string;
    setCurrentViewStyle(style: string): void;
    enableViewSelection: boolean;
    preRender(): void;
    renderTab(): void;
};

export default function GenreTab(this: GenreTabController, view: HTMLElement, params: GenreParams, tabContent: HTMLElement, options: GenreOptions) {
    let initialFocus: ReturnType<typeof createInitialContentFocus> | undefined;
    let firstRow: HTMLElement | null = null;
    let generation = 0;
    let active = true;
    view.addEventListener('viewbeforehide', () => {
        active = false;
    });
    view.addEventListener('viewdestroy', () => {
        active = false;
    });
    view.addEventListener('viewshow', () => {
        active = true;
    });

    function getPageData() {
        const key = getSavedQueryKey();
        let pageData = data[key];

        if (!pageData) {
            pageData = data[key] = {
                query: {
                    SortBy: 'SortName',
                    SortOrder: 'Ascending',
                    IncludeItemTypes: options.itemType,
                    Recursive: true,
                    EnableTotalRecordCount: false
                },
                view: options.restoreSavedView ? userSettings.getSavedView(key) || 'Poster' : 'Poster'
            };
            pageData.query.ParentId = params.topParentId;
            userSettings.loadQuerySettings(key, pageData.query);
        }

        return pageData;
    }

    function getQuery() {
        return getPageData().query;
    }

    function getSavedQueryKey() {
        return params.topParentId + '-' + options.queryKey;
    }

    function getPromise() {
        loading.show();
        const query = getQuery();
        return window.ApiClient.getGenres(window.ApiClient.getCurrentUserId(), query) as Promise<GenreResult>;
    }

    function enableScrollX() {
        return true;
    }

    function finishRowFocus(row: HTMLElement) {
        if (!active || tabContent.offsetParent === null || document.activeElement !== row) return;
        const target = row.querySelector<HTMLElement>('.card') || row.closest('.verticalSection')?.querySelector<HTMLElement>('.more');
        if (target) focusManager.focus(target);
    }

    const fillItemsContainer = (entry: IntersectionObserverEntry, observer: IntersectionObserver) => {
        if (!entry.isIntersecting) {
            return;
        }

        const elem = entry.target as HTMLElement;
        observer.unobserve(elem);
        if (!tabContent.contains(elem)) return;

        elem.dataset.loading = 'true';
        const id = elem.getAttribute('data-id');
        const viewStyle = this.getCurrentViewStyle();
        let limit = viewStyle == 'Thumb' || viewStyle == 'ThumbCard' ? 5 : 9;

        if (enableScrollX()) {
            limit = 10;
        }

        const enableImageTypes = viewStyle == 'Thumb' || viewStyle == 'ThumbCard' ? 'Primary,Backdrop,Thumb' : 'Primary';
        const query = {
            SortBy: 'Random',
            SortOrder: 'Ascending',
            IncludeItemTypes: options.itemType,
            Recursive: true,
            Fields: 'PrimaryImageAspectRatio,MediaSourceCount',
            ImageTypeLimit: 1,
            EnableImageTypes: enableImageTypes,
            Limit: limit,
            GenreIds: id!,
            EnableTotalRecordCount: false,
            ParentId: params.topParentId
        };
        void window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), query).then(function (result) {
            delete elem.dataset.loading;
            if (!tabContent.contains(elem)) return;
            buildGenreCards(elem, result.Items!, viewStyle, options);
            finishRowFocus(elem);
            if (result.Items!.length >= query.Limit) {
                tabContent.querySelector('.btnMoreFromGenre' + id + ' .material-icons')!.classList.remove('hide');
            }
            if (elem === firstRow) initialFocus?.();
        }).catch(error => {
            delete elem.dataset.loading;
            finishRowFocus(elem);
            if (elem === firstRow) initialFocus?.cancel();
            console.error(error);
        });
    };

    function reloadItems(context: HTMLElement, promise: Promise<GenreResult>, request: number) {
        const query = getQuery();
        void promise.then(function (result) {
            if (request !== generation) return;
            const elem = context.querySelector<HTMLElement>('#items')!;
            elem.innerHTML = getGenreRowsHtml(result.Items, params, options);
            firstRow = elem.querySelector<HTMLElement>('.itemsContainer');
            lazyLoader.lazyChildren(elem, fillItemsContainer);
            if (!firstRow) initialFocus?.();
            userSettings.saveQuerySettings(getSavedQueryKey(), query);
            loading.hide();
        }).catch(error => {
            if (request === generation) {
                initialFocus?.cancel();
                loading.hide();
            }
            console.error(error);
        });
    }

    const fullyReload = () => {
        this.preRender();
        this.renderTab();
    };

    const data: Record<string, { query: GenreQuery; view: string }> = {};

    this.getViewStyles = function () {
        return 'Poster,PosterCard,Thumb,ThumbCard'.split(',');
    };

    this.getCurrentViewStyle = function () {
        return getPageData().view;
    };

    this.setCurrentViewStyle = function (viewStyle: string) {
        getPageData().view = viewStyle;
        userSettings.saveViewSetting(getSavedQueryKey(), viewStyle);
        fullyReload();
    };

    this.enableViewSelection = true;
    let promise: Promise<GenreResult>;

    this.preRender = function () {
        promise = getPromise();
    };

    this.renderTab = function () {
        initialFocus?.cancel();
        initialFocus = createInitialContentFocus(view, tabContent);
        reloadItems(tabContent, promise, ++generation);
    };
}

