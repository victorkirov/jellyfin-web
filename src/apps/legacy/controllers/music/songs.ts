import { ItemAction } from 'constants/itemAction';
import type { LibraryController, LibraryPageData, LibraryResult } from '../libraryControllerTypes';

import libraryBrowser from 'scripts/libraryBrowser';
import imageLoader from 'components/images/imageLoader';
import listView from 'components/listview/listview';
import loading from 'components/loading/loading';
import { playbackManager } from 'components/playback/playbackmanager';
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
                        SortBy: 'Album,SortName',
                        SortOrder: 'Ascending',
                        IncludeItemTypes: 'Audio',
                        Recursive: true,
                        Fields: 'ParentId',
                        StartIndex: 0,
                        ImageTypeLimit: 1,
                        EnableImageTypes: 'Primary'
                    }
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
            return `${params.topParentId}-songs`;
        };

        const reloadItems = (page: HTMLElement = tabContent) => {
            loading.show();
            isLoading = true;
            const query = getQuery();
            setFilterStatus(tabContent, query);

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
                const html = listView.getListViewHtml({
                    items: result.Items,
                    action: ItemAction.PlayAllFromHere,
                    smallIcon: true,
                    artist: true
                });
                let elems = tabContent.querySelectorAll('.paging');

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

                const itemsContainer = tabContent.querySelector<HTMLElement>('.itemsContainer')!;
                itemsContainer.innerHTML = html;
                imageLoader.lazyChildren(itemsContainer);
                userSettings.saveQuerySettings(getSavedQueryKey(), query);

                tabContent.querySelector<HTMLElement>('.btnShuffle')!.classList.toggle('hide', result.TotalRecordCount < 1);

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
                    mode: 'songs',
                    serverId: window.ApiClient.serverId()
                });
                Events.on(filterDialog, 'filterchange', () => {
                    getQuery().StartIndex = 0;
                    reloadItems();
                });
                void filterDialog.show();
            });
        };

        const shuffle = () => {
            void window.ApiClient.getItem(window.ApiClient.getCurrentUserId(), params.topParentId!).then((item) => {
                playbackManager.shuffle(item);
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
                        name: globalize.translate('OptionTrackName'),
                        id: 'Name'
                    }, {
                        name: globalize.translate('Album'),
                        id: 'Album,AlbumArtist,SortName'
                    }, {
                        name: globalize.translate('AlbumArtist'),
                        id: 'AlbumArtist,Album,SortName'
                    }, {
                        name: globalize.translate('Artist'),
                        id: 'Artist,Album,SortName'
                    }, {
                        name: globalize.translate('OptionDateAdded'),
                        id: 'DateCreated,SortName'
                    }, {
                        name: globalize.translate('OptionDatePlayed'),
                        id: 'DatePlayed,SortName'
                    }, {
                        name: globalize.translate('OptionPlayCount'),
                        id: 'PlayCount,SortName'
                    }, {
                        name: globalize.translate('OptionReleaseDate'),
                        id: 'PremiereDate,AlbumArtist,Album,SortName'
                    }, {
                        name: globalize.translate('Runtime'),
                        id: 'Runtime,AlbumArtist,Album,SortName'
                    }, {
                        name: globalize.translate('OptionRandom'),
                        id: 'Random,SortName'
                    }],
                    callback: () => {
                        getQuery().StartIndex = 0;
                        reloadItems();
                    },
                    query: getQuery(),
                    button: e.target as HTMLElement
                });
            });
            tabElement.querySelector<HTMLElement>('.btnShuffle')!.addEventListener('click', shuffle);
        };

        initPage(tabContent);

        this.renderTab = () => {
            reloadItems(tabContent);
        };
    }
}
