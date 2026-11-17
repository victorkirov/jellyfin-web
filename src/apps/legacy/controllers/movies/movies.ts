import { focusLibraryRefresh, isLibraryDialogFocused } from '../libraryRail';
import { getMovieItemsHtml, getMovieSortOptions } from './movieItems';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import type { LibraryQuery } from '../libraryControllerTypes';
import { bindLibraryPaging, getLibraryLayout, libraryLayouts } from '../libraryPaging';
import loading from 'components/loading/loading';
import * as userSettings from 'scripts/settings/userSettings';
import libraryBrowser from 'scripts/libraryBrowser';
import { AlphaPicker } from 'components/alphaPicker/alphaPicker';
import Events from 'utils/events';
import { playbackManager } from 'components/playback/playbackmanager';
import { getFilterStatus, setFilterStatus } from 'components/filterdialog/filterIndicator';

import 'components/itemscontainer/emby-itemscontainer';
type ItemsContainer = HTMLElement & { fetchData?: () => Promise<unknown>; getItemsHtml?: (items: BaseItemDto[]) => string; afterRefresh?: (result: { TotalRecordCount: number }) => void; refreshItems(): Promise<void>; pause(): void; resume(): Promise<void> };

export default class LibraryTab {
    alphaPicker!: AlphaPicker;
    getCurrentViewStyle!: () => string;
    renderTab!: () => Promise<void>;
    showFilterMenu!: () => void;
    initTab!: () => void;
    destroy!: () => void;

    constructor(view: HTMLElement, params: { topParentId?: string }, tabContent: HTMLElement, options: { mode: string }) {
        const onViewStyleChange = () => {
            if (this.getCurrentViewStyle() == 'List') {
                itemsContainer!.classList.add('vertical-list');
                itemsContainer!.classList.remove('vertical-wrap');
            } else {
                itemsContainer!.classList.remove('vertical-list');
                itemsContainer!.classList.add('vertical-wrap');
            }

            itemsContainer!.innerHTML = '';
        };

        function fetchData() {
            isLoading = true;
            loading.show();
            const request = ++requestId;
            return window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), { ...query }).finally(() => {
                if (request === requestId) {
                    isLoading = false;
                    loading.hide();
                }
            });
        }

        function playAll() {
            void window.ApiClient.getItem(window.ApiClient.getCurrentUserId(), params.topParentId!).then(function (item) {
                void playbackManager.play({
                    items: [item]
                });
            });
        }

        function shuffle() {
            isLoading = true;
            loading.show();
            const newQuery = { ...query, SortBy: 'Random', StartIndex: 0, Limit: 300, Fields: 'PrimaryImageAspectRatio,MediaSourceCount,Chapters,Trickplay' };
            return window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), newQuery).then(({ Items }) => {
                void playbackManager.play({
                    items: Items,
                    autoplay: true
                });
            }).finally(() => {
                isLoading = false;
                loading.hide();
            });
        }

        const afterRefresh = (result: { TotalRecordCount: number }) => {
            setFilterStatus(tabContent, query);

            window.scrollTo(0, 0);
            this.alphaPicker?.updateControls(query);
            bindLibraryPaging({
                view: tabContent, query, totalRecordCount: result.TotalRecordCount,
                isLoading: () => isLoading, getRequestId: () => requestId,
                refresh: () => itemsContainer!.refreshItems()
            });

            tabContent.querySelector('.btnPlayAll')?.classList.toggle('hide', result.TotalRecordCount < 1);
            tabContent.querySelector('.btnShuffle')?.classList.toggle('hide', result.TotalRecordCount < 1);

            if (focusLibraryRefresh(tabContent)) return;
            const request = requestId;
            void import('components/autoFocuser').then(({ default: autoFocuser }) => {
                if (request === requestId && active && itemsContainer && !isLibraryDialogFocused()) autoFocuser.autoFocus(tabContent);
            });
        };

        const initPage = (tabElement: HTMLElement) => {
            itemsContainer!.fetchData = fetchData;
            itemsContainer!.getItemsHtml = items => getMovieItemsHtml(items, this.getCurrentViewStyle(), query.SortBy);
            itemsContainer!.afterRefresh = afterRefresh;
            const alphaPickerElement = tabElement.querySelector<HTMLElement>('.alphaPicker')!;

            if (alphaPickerElement) {
                alphaPickerElement.addEventListener('alphavaluechanged', function (e) {
                    const newValue = (e as CustomEvent<{ value: string | null }>).detail.value;
                    if (newValue === '#') {
                        query.NameLessThan = 'A';
                        delete query.NameStartsWith;
                    } else {
                        query.NameStartsWith = newValue;
                        delete query.NameLessThan;
                    }
                    query.StartIndex = 0;
                    itemsContainer!.refreshItems().catch(console.error);
                });
                this.alphaPicker = new AlphaPicker({
                    element: alphaPickerElement,
                    valueChangeEvent: 'click'
                });
            }

            const btnFilter = tabElement.querySelector('.btnFilter');

            if (btnFilter) {
                btnFilter.addEventListener('click', () => {
                    this.showFilterMenu();
                });
            }
            const btnSort = tabElement.querySelector('.btnSort');

            if (btnSort) {
                btnSort.addEventListener('click', function (e) {
                    libraryBrowser.showSortMenu({
                        items: getMovieSortOptions(),
                        callback: function () {
                            query.StartIndex = 0;
                            userSettings.saveQuerySettings(savedQueryKey, query);
                            itemsContainer!.refreshItems().catch(console.error);
                        },
                        query: query,
                        button: e.target as HTMLElement
                    });
                });
            }
            const btnSelectView = tabElement.querySelector<HTMLElement>('.btnSelectView')!;
            btnSelectView.addEventListener('click', (e) => {
                libraryBrowser.showLayoutMenu(e.target, this.getCurrentViewStyle(), libraryLayouts);
            });
            btnSelectView.addEventListener('layoutchange', function (e) {
                const viewStyle = (e as CustomEvent<{ viewStyle: string }>).detail.viewStyle;
                userSettings.set(savedViewKey, viewStyle);
                query.StartIndex = 0;
                onViewStyleChange();
                itemsContainer!.refreshItems().catch(console.error);
            });

            tabElement.querySelector<HTMLElement>('.btnPlayAll')?.addEventListener('click', playAll);
            tabElement.querySelector('.btnShuffle')?.addEventListener('click', shuffle);
        };

        let itemsContainer: ItemsContainer | null = tabContent.querySelector<ItemsContainer>('.itemsContainer')!;
        const savedQueryKey = params.topParentId + '-' + options.mode;
        const savedViewKey = savedQueryKey + '-view';
        let requestId = 0;
        let active = true;
        let query: LibraryQuery = {
            SortBy: 'SortName,ProductionYear',
            SortOrder: 'Ascending',
            IncludeItemTypes: 'Movie',
            Recursive: true,
            Fields: 'PrimaryImageAspectRatio,MediaSourceCount',
            ImageTypeLimit: 1,
            EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
            StartIndex: 0,
            ParentId: params.topParentId
        };

        if (userSettings.libraryPageSize() > 0) {
            query['Limit'] = userSettings.libraryPageSize();
        }

        let isLoading = false;

        if (options.mode === 'favorites') {
            query.IsFavorite = true;
        }

        query = userSettings.loadQuerySettings(savedQueryKey, query);

        this.showFilterMenu = function () {
            void import('components/filterdialog/filterdialog').then(({ default: FilterDialog }) => {
                const filterDialog = new FilterDialog({
                    query: query,
                    mode: 'movies',
                    serverId: window.ApiClient.serverId(),
                    hasFilters: getFilterStatus(query)
                });
                Events.on(filterDialog, 'filterchange', () => {
                    query.StartIndex = 0;
                    userSettings.saveQuerySettings(savedQueryKey, query);
                    itemsContainer!.refreshItems().catch(console.error);
                });
                void filterDialog.show();
            });
        };

        this.getCurrentViewStyle = function () {
            return getLibraryLayout(savedQueryKey, true);
        };

        this.initTab = function () {
            initPage(tabContent);
            onViewStyleChange();
        };

        this.renderTab = () => {
            this.alphaPicker?.updateControls(query);
            return itemsContainer!.refreshItems();
        };

        function pause() {
            active = false;
            requestId++;
            isLoading = false;
            loading.hide();
            itemsContainer?.pause();
        }
        view.addEventListener('viewbeforehide', pause);
        view.addEventListener('viewshow', () => {
            active = true;
            itemsContainer?.resume().catch(console.error);
        });
        this.destroy = function () {
            pause();
            itemsContainer = null;
        };
    }
}
