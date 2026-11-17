import { getEpisodesHtml } from '../libraryItemRendering';
import type { LibraryController, LibraryPageData, LibraryResult } from '../libraryControllerTypes';
import loading from 'components/loading/loading';
import libraryBrowser from 'scripts/libraryBrowser';
import imageLoader from 'components/images/imageLoader';
import * as userSettings from 'scripts/settings/userSettings';
import globalize from 'lib/globalize';
import Dashboard from 'components/dashboard';
import Events from 'utils/events';
import { setFilterStatus } from 'components/filterdialog/filterIndicator';

import 'components/itemscontainer/emby-itemscontainer';

export default class LibraryTab {
    alphaPicker?: LibraryController['alphaPicker'];
    getCurrentViewStyle!: LibraryController['getCurrentViewStyle'];
    renderTab!: LibraryController['renderTab'];
    showFilterMenu!: LibraryController['showFilterMenu'];

    constructor(view: HTMLElement, params: { topParentId?: string }, tabContent: HTMLElement) {
        const getPageData = () => {
            const key = getSavedQueryKey();
            let pageData = data[key];

            if (!pageData) {
                pageData = data[key] = {
                    query: {
                        SortBy: 'SeriesSortName,SortName',
                        SortOrder: 'Ascending',
                        IncludeItemTypes: 'Episode',
                        Recursive: true,
                        Fields: 'PrimaryImageAspectRatio,MediaSourceCount',
                        IsMissing: false,
                        ImageTypeLimit: 1,
                        EnableImageTypes: 'Primary,Backdrop,Thumb',
                        StartIndex: 0
                    },
                    view: userSettings.getSavedView(key) || 'Poster'
                };

                if (userSettings.libraryPageSize() > 0) {
                    pageData.query['Limit'] = userSettings.libraryPageSize();
                }

                pageData.query.ParentId = params.topParentId;
                userSettings.loadQuerySettings(key, pageData.query);
            }

            return pageData;
        };

        const getQuery = () => {
            return getPageData().query;
        };

        const getSavedQueryKey = () => {
            return `${params.topParentId}-episodes`;
        };

        const onViewStyleChange = () => {
            const viewStyle = this.getCurrentViewStyle();
            const itemsContainer = tabContent.querySelector<HTMLElement>('.itemsContainer')!;

            if (viewStyle == 'List') {
                itemsContainer.classList.add('vertical-list');
                itemsContainer.classList.remove('vertical-wrap');
            } else {
                itemsContainer.classList.remove('vertical-list');
                itemsContainer.classList.add('vertical-wrap');
            }

            itemsContainer.innerHTML = '';
        };

        const reloadItems = (page: HTMLElement = tabContent) => {
            loading.show();
            isLoading = true;
            const query = getQuery();
            setFilterStatus(page, query);

            void window.ApiClient.getItems(Dashboard.getCurrentUserId()!, query).then((response) => {
                // These endpoints return Items and TotalRecordCount for paged library queries.
                const result = response as LibraryResult;
                const onNextPageClick = () => {
                    if (isLoading) {
                        return;
                    }

                    if (userSettings.libraryPageSize() > 0) {
                        query.StartIndex += query.Limit!;
                    }
                    reloadItems(tabContent);
                };

                const onPreviousPageClick = () => {
                    if (isLoading) {
                        return;
                    }

                    if (userSettings.libraryPageSize() > 0) {
                        query.StartIndex = Math.max(0, query.StartIndex - query.Limit!);
                    }
                    reloadItems(tabContent);
                };

                window.scrollTo(0, 0);
                let html;
                const pagingHtml = libraryBrowser.getQueryPagingHtml({
                    startIndex: query.StartIndex,
                    limit: query.Limit,
                    totalRecordCount: result.TotalRecordCount,
                    showLimit: false,
                    updatePageSizeSetting: false,
                    addLayoutButton: false,
                    sortButton: false,
                    filterButton: false
                });
                html = getEpisodesHtml({ viewStyle: this.getCurrentViewStyle(), query, result });
                const itemsContainer = tabContent.querySelector<HTMLElement>('.itemsContainer')!;
                let elems;

                elems = tabContent.querySelectorAll('.paging');
                for (let i = 0, length = elems.length; i < length; i++) {
                    elems[i].innerHTML = pagingHtml;
                }

                elems = tabContent.querySelectorAll('.btnNextPage');
                for (let i = 0, length = elems.length; i < length; i++) {
                    elems[i].addEventListener('click', onNextPageClick);
                }

                elems = tabContent.querySelectorAll('.btnPreviousPage');
                for (let i = 0, length = elems.length; i < length; i++) {
                    elems[i].addEventListener('click', onPreviousPageClick);
                }

                itemsContainer.innerHTML = html;
                imageLoader.lazyChildren(itemsContainer);
                userSettings.saveQuerySettings(getSavedQueryKey(), query);
                loading.hide();
                isLoading = false;

                void import('components/autoFocuser').then(({ default: autoFocuser }) => {
                    autoFocuser.autoFocus(page);
                });
            });
        };

        const data: Record<string, LibraryPageData> = {};
        let isLoading = false;

        this.showFilterMenu = () => {
            void import('components/filterdialog/filterdialog').then(({ default: FilterDialog }) => {
                const filterDialog = new FilterDialog({
                    query: getQuery(),
                    mode: 'episodes',
                    serverId: window.ApiClient.serverId()
                });
                Events.on(filterDialog, 'filterchange', () => {
                    getQuery().StartIndex = 0;
                    reloadItems(tabContent);
                });
                void filterDialog.show();
            });
        };

        this.getCurrentViewStyle = () => {
            return getPageData().view;
        };

        const initPage = (tabElement: HTMLElement) => {
            tabElement.querySelector<HTMLElement>('.btnFilter')!.addEventListener('click', () => {
                this.showFilterMenu();
            });
            tabElement.querySelector<HTMLElement>('.btnSort')!.addEventListener('click', (e) => {
                libraryBrowser.showSortMenu({
                    items: [{
                        name: globalize.translate('Name'),
                        id: 'SeriesSortName,SortName'
                    }, {
                        name: globalize.translate('OptionTvdbRating'),
                        id: 'CommunityRating,SeriesSortName,SortName'
                    }, {
                        name: globalize.translate('OptionDateAdded'),
                        id: 'DateCreated,SeriesSortName,SortName'
                    }, {
                        name: globalize.translate('OptionPremiereDate'),
                        id: 'PremiereDate,SeriesSortName,SortName'
                    }, {
                        name: globalize.translate('OptionDatePlayed'),
                        id: 'DatePlayed,SeriesSortName,SortName'
                    }, {
                        name: globalize.translate('OptionParentalRating'),
                        id: 'OfficialRating,SeriesSortName,SortName'
                    }, {
                        name: globalize.translate('OptionPlayCount'),
                        id: 'PlayCount,SeriesSortName,SortName'
                    }, {
                        name: globalize.translate('Runtime'),
                        id: 'Runtime,SeriesSortName,SortName'
                    }],
                    callback: () => {
                        reloadItems(tabElement);
                    },
                    query: getQuery(),
                    button: e.target as HTMLElement
                });
            });
            const btnSelectView = tabElement.querySelector<HTMLElement>('.btnSelectView')!;
            btnSelectView.addEventListener('click', (e) => {
                libraryBrowser.showLayoutMenu(e.target, this.getCurrentViewStyle(), 'List,Poster,PosterCard'.split(','));
            });
            btnSelectView.addEventListener('layoutchange', (e) => {
                const viewStyle = (e as CustomEvent<{ viewStyle: string }>).detail.viewStyle;
                getPageData().view = viewStyle;
                userSettings.saveViewSetting(getSavedQueryKey(), viewStyle);
                onViewStyleChange();
                reloadItems(tabElement);
            });
        };

        initPage(tabContent);
        onViewStyleChange();

        this.renderTab = () => {
            reloadItems(tabContent);
        };
    }
}
