import { getShowItemsHtml, getShowSortOptions } from './showItems';
import { focusLibraryContent } from '../libraryRail';
import type { LibraryPageData } from '../libraryControllerTypes';
import { bindLibraryPaging, getLibraryLayout, libraryLayouts, supportedLibraryLayout } from '../libraryPaging';
import loading from 'components/loading/loading';
import libraryBrowser from 'scripts/libraryBrowser';
import imageLoader from 'components/images/imageLoader';
import AlphaPicker from 'components/alphaPicker/alphaPicker';
import * as userSettings from 'scripts/settings/userSettings';
import Events from 'utils/events';
import { setFilterStatus } from 'components/filterdialog/filterIndicator';

import 'components/itemscontainer/emby-itemscontainer';

export default class LibraryTab {
    alphaPicker!: AlphaPicker;
    getCurrentViewStyle!: () => string;
    renderTab!: () => Promise<void>;
    showFilterMenu!: () => void;
    initTab!: () => void;
    destroy!: () => void;

    constructor(view: HTMLElement, params: { topParentId?: string }, tabContent: HTMLElement) {
        function getPageData() {
            const key = getSavedQueryKey();
            let pageData = data[key];

            if (!pageData) {
                pageData = data[key] = {
                    query: {
                        SortBy: 'SortName',
                        SortOrder: 'Ascending',
                        IncludeItemTypes: 'Series',
                        Recursive: true,
                        Fields: 'PrimaryImageAspectRatio',
                        ImageTypeLimit: 1,
                        EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
                        StartIndex: 0
                    },
                    view: getLibraryLayout(key)
                };

                if (userSettings.libraryPageSize() > 0) {
                    pageData.query['Limit'] = userSettings.libraryPageSize();
                }

                pageData.query.ParentId = params.topParentId;
                userSettings.loadQuerySettings(key, pageData.query);
            }

            return pageData;
        }

        function getQuery() {
            return getPageData().query;
        }

        function getSavedQueryKey() {
            return `${params.topParentId}-series`;
        }

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

        const reloadItems = (page: HTMLElement) => {
            loading.show();
            isLoading = true;
            const query = getQuery();
            setFilterStatus(page, query);

            const request = ++requestId;
            return window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), { ...query }).then((result) => {
                if (request !== requestId || !active) return;
                window.scrollTo(0, 0);
                this.alphaPicker?.updateControls(query);
                bindLibraryPaging({
                    view: tabContent, query, totalRecordCount: result.TotalRecordCount,
                    isLoading: () => isLoading, getRequestId: () => requestId, refresh: () => reloadItems(tabContent)
                });
                const html = getShowItemsHtml(result.Items, this.getCurrentViewStyle(), query.SortBy);

                const itemsContainer = tabContent.querySelector<HTMLElement>('.itemsContainer')!;
                itemsContainer.innerHTML = html;
                imageLoader.lazyChildren(itemsContainer);
                userSettings.saveQuerySettings(getSavedQueryKey(), query);
                if (tabContent.querySelector('.libraryRail')) {
                    focusLibraryContent(tabContent);
                    return;
                }
                void import('components/autoFocuser').then(({ default: autoFocuser }) => {
                    if (request === requestId && active) autoFocuser.autoFocus(page);
                });
            }).finally(() => {
                if (request === requestId) {
                    loading.hide();
                    isLoading = false;
                }
            });
        };

        let requestId = 0;
        let active = true;
        let refreshOnShow = false;
        const data: Record<string, LibraryPageData> = {};
        let isLoading = false;

        this.showFilterMenu = function () {
            void import('components/filterdialog/filterdialog').then(({ default: FilterDialog }) => {
                const filterDialog = new FilterDialog({
                    query: getQuery(),
                    mode: 'series',
                    serverId: window.ApiClient.serverId()
                });
                Events.on(filterDialog, 'filterchange', function () {
                    getQuery().StartIndex = 0;
                    reloadItems(tabContent).catch(console.error);
                });
                void filterDialog.show();
            });
        };

        this.getCurrentViewStyle = function () {
            return supportedLibraryLayout(getPageData().view);
        };

        const initPage = (tabElement: HTMLElement) => {
            const alphaPickerElement = tabElement.querySelector<HTMLElement>('.alphaPicker')!;
            alphaPickerElement.addEventListener('alphavaluechanged', function (e) {
                const newValue = (e as CustomEvent<{ value: string | null }>).detail.value;
                const query = getQuery();
                if (newValue === '#') {
                    query.NameLessThan = 'A';
                    delete query.NameStartsWith;
                } else {
                    query.NameStartsWith = newValue;
                    delete query.NameLessThan;
                }
                query.StartIndex = 0;
                reloadItems(tabElement).catch(console.error);
            });
            this.alphaPicker = new AlphaPicker({
                element: alphaPickerElement,
                valueChangeEvent: 'click'
            });

            tabElement.querySelector<HTMLElement>('.btnFilter')!.addEventListener('click', () => {
                this.showFilterMenu();
            });
            tabElement.querySelector<HTMLElement>('.btnSort')!.addEventListener('click', function (e) {
                libraryBrowser.showSortMenu({
                    items: getShowSortOptions(),
                    callback: function () {
                        getQuery().StartIndex = 0;
                        reloadItems(tabElement).catch(console.error);
                    },
                    query: getQuery(),
                    button: e.target as HTMLElement
                });
            });
            const btnSelectView = tabElement.querySelector<HTMLElement>('.btnSelectView')!;
            btnSelectView.addEventListener('click', (e) => {
                libraryBrowser.showLayoutMenu(e.target, this.getCurrentViewStyle(), libraryLayouts);
            });
            btnSelectView.addEventListener('layoutchange', function (e) {
                const viewStyle = (e as CustomEvent<{ viewStyle: string }>).detail.viewStyle;
                getPageData().view = viewStyle;
                userSettings.saveViewSetting(getSavedQueryKey(), viewStyle);
                getQuery().StartIndex = 0;
                onViewStyleChange();
                reloadItems(tabElement).catch(console.error);
            });
        };

        initPage(tabContent);
        onViewStyleChange();

        this.renderTab = () => {
            return reloadItems(tabContent);
        };
        const pause = () => {
            refreshOnShow = refreshOnShow || isLoading;
            active = false;
            requestId++;
            isLoading = false;
            loading.hide();
        };
        view.addEventListener('viewbeforehide', pause);
        view.addEventListener('viewshow', () => {
            active = true;
            if (refreshOnShow) {
                refreshOnShow = false;
                reloadItems(tabContent).catch(console.error);
            }
        });
        this.destroy = pause;
    }
}
