import { ItemAction } from 'constants/itemAction';
import { createLibraryRefresh } from '../libraryRefresh';
import { bindLibraryPaging } from '../libraryPaging';
import type { LibraryController, LibraryPageData } from '../libraryControllerTypes';

import libraryBrowser from 'scripts/libraryBrowser';
import imageLoader from 'components/images/imageLoader';
import listView from 'components/listview/listview';
import { playbackManager } from 'components/playback/playbackmanager';
import * as userSettings from 'scripts/settings/userSettings';
import globalize from 'lib/globalize';
import Events from 'utils/events';
import { setFilterStatus } from 'components/filterdialog/filterIndicator';

import 'components/itemscontainer/emby-itemscontainer';

export default class LibraryTab {
    destroy!: () => void;
    isRefreshInterrupted!: () => boolean;
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

        const refreshState = createLibraryRefresh({
            view, focus: tabContent, getQuery,
            load: query => {
                setFilterStatus(tabContent, query);
                return window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), query);
            },
            render: (result, query) => {
                window.scrollTo(0, 0);
                const html = listView.getListViewHtml({
                    items: result.Items,
                    action: ItemAction.PlayAllFromHere,
                    smallIcon: true,
                    artist: true
                });
                bindLibraryPaging({ view: tabContent, query: getQuery(), totalRecordCount: result.TotalRecordCount,
                    isLoading: refreshState.isLoading, getRequestId: refreshState.getRequestId,
                    refresh: () => refreshState.refresh()
                });

                const itemsContainer = tabContent.querySelector<HTMLElement>('.itemsContainer')!;
                itemsContainer.innerHTML = html;
                imageLoader.lazyChildren(itemsContainer);
                userSettings.saveQuerySettings(getSavedQueryKey(), query);

                tabContent.querySelector<HTMLElement>('.btnShuffle')!.classList.toggle('hide', result.TotalRecordCount < 1);
            }
        });
        this.destroy = refreshState.destroy;
        this.isRefreshInterrupted = refreshState.isInterrupted;
        const reloadItems = () => refreshState.refreshSafely();

        const data: Record<string, LibraryPageData> = {};

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
            return refreshState.refresh();
        };
    }
}
