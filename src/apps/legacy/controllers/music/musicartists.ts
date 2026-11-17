import { getArtistsHtml } from '../libraryItemRendering';
import type { LibraryController, LibraryPageData, LibraryQuery, LibraryResult } from '../libraryControllerTypes';
import loading from 'components/loading/loading';
import libraryBrowser from 'scripts/libraryBrowser';
import imageLoader from 'components/images/imageLoader';
import { AlphaPicker } from 'components/alphaPicker/alphaPicker';
import * as userSettings from 'scripts/settings/userSettings';
import Events from 'utils/events';
import { setFilterStatus } from 'components/filterdialog/filterIndicator';

import 'components/itemscontainer/emby-itemscontainer';

export default class LibraryTab {
    alphaPicker?: LibraryController['alphaPicker'];
    getCurrentViewStyle!: LibraryController['getCurrentViewStyle'];
    renderTab!: LibraryController['renderTab'];
    showFilterMenu!: LibraryController['showFilterMenu'];

    constructor(view: HTMLElement, params: { topParentId?: string }, tabContent: HTMLElement, options: { mode: string }) {
        const getPageData = () => {
            const key = getSavedQueryKey();
            let pageData = data[key];

            if (!pageData) {
                const queryValues: LibraryQuery = {
                    SortBy: 'SortName',
                    SortOrder: 'Ascending',
                    Recursive: true,
                    Fields: 'PrimaryImageAspectRatio,SortName',
                    StartIndex: 0,
                    ImageTypeLimit: 1,
                    EnableImageTypes: 'Primary,Backdrop,Banner,Thumb'
                };

                if (userSettings.libraryPageSize() > 0) {
                    queryValues['Limit'] = userSettings.libraryPageSize();
                }

                pageData = data[key] = {
                    query: queryValues,
                    view: userSettings.getSavedView(key) || 'Poster'
                };
                pageData.query.ParentId = params.topParentId;
                userSettings.loadQuerySettings(key, pageData.query);
            }

            return pageData;
        };

        const getQuery = () => {
            return getPageData().query;
        };

        const getSavedQueryKey = () => {
            return `${params.topParentId}-${options.mode}`;
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

        const reloadItems = () => {
            loading.show();
            isLoading = true;
            const query = getQuery();
            setFilterStatus(tabContent, query);

            const promise = options.mode == 'albumartists' ?
                window.ApiClient.getAlbumArtists(window.ApiClient.getCurrentUserId(), query) :
                window.ApiClient.getArtists(window.ApiClient.getCurrentUserId(), query);
            void promise.then((response) => {
                // These endpoints return Items and TotalRecordCount for paged library queries.
                const result = response as LibraryResult;
                const onNextPageClick = () => {
                    if (isLoading) {
                        return;
                    }

                    if (userSettings.libraryPageSize() > 0) {
                        query.StartIndex += query.Limit!;
                    }
                    reloadItems();
                };

                const onPreviousPageClick = () => {
                    if (isLoading) {
                        return;
                    }

                    if (userSettings.libraryPageSize() > 0) {
                        query.StartIndex = Math.max(0, query.StartIndex - query.Limit!);
                    }
                    reloadItems();
                };

                window.scrollTo(0, 0);
                this.alphaPicker?.updateControls(query);
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
                html = getArtistsHtml({ viewStyle: this.getCurrentViewStyle(), query, result });
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
                loading.hide();
                isLoading = false;

                void import('components/autoFocuser').then(({ default: autoFocuser }) => {
                    autoFocuser.autoFocus(tabContent);
                });
            });
        };

        const data: Record<string, LibraryPageData> = {};
        let isLoading = false;

        this.showFilterMenu = () => {
            void import('components/filterdialog/filterdialog').then(({ default: FilterDialog }) => {
                const filterDialog = new FilterDialog({
                    query: getQuery(),
                    mode: options.mode,
                    serverId: window.ApiClient.serverId()
                });
                Events.on(filterDialog, 'filterchange', () => {
                    getQuery().StartIndex = 0;
                    reloadItems();
                });
                void filterDialog.show();
            });
        };

        this.getCurrentViewStyle = () => {
            return getPageData().view;
        };

        const initPage = (tabElement: HTMLElement) => {
            const alphaPickerElement = tabElement.querySelector<HTMLElement>('.alphaPicker')!;

            alphaPickerElement.addEventListener('alphavaluechanged', (e) => {
                const newValue = (e as CustomEvent<{ value: string }>).detail.value;
                const query = getQuery();
                if (newValue === '#') {
                    query.NameLessThan = 'A';
                    delete query.NameStartsWith;
                } else {
                    query.NameStartsWith = newValue;
                    delete query.NameLessThan;
                }
                query.StartIndex = 0;
                reloadItems();
            });
            this.alphaPicker = new AlphaPicker({
                element: alphaPickerElement,
                valueChangeEvent: 'click'
            });

            tabElement.querySelector<HTMLElement>('.btnFilter')!.addEventListener('click', () => {
                this.showFilterMenu();
            });
            const btnSelectView = tabElement.querySelector<HTMLElement>('.btnSelectView')!;
            btnSelectView.addEventListener('click', (e) => {
                libraryBrowser.showLayoutMenu(e.target, this.getCurrentViewStyle(), 'List,Poster,PosterCard'.split(','));
            });
            btnSelectView.addEventListener('layoutchange', (e) => {
                const viewStyle = (e as CustomEvent<{ viewStyle: string }>).detail.viewStyle;
                getPageData().view = viewStyle;
                userSettings.saveViewSetting(getSavedQueryKey(), viewStyle);
                getQuery().StartIndex = 0;
                onViewStyleChange();
                reloadItems();
            });
        };

        initPage(tabContent);
        onViewStyleChange();

        this.renderTab = () => {
            reloadItems();
            this.alphaPicker?.updateControls(getQuery());
        };
    }
}
