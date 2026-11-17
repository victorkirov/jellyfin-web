import { createLibraryRefresh } from '../libraryRefresh';
import { bindLibraryPaging } from '../libraryPaging';
import { getCollectionsHtml } from '../libraryItemRendering';
import type { LibraryController, LibraryPageData } from '../libraryControllerTypes';
import libraryBrowser from 'scripts/libraryBrowser';
import { AlphaPicker } from 'components/alphaPicker/alphaPicker';
import imageLoader from 'components/images/imageLoader';
import * as userSettings from 'scripts/settings/userSettings';
import globalize from 'lib/globalize';
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
                        SortBy: 'SortName',
                        SortOrder: 'Ascending',
                        IncludeItemTypes: 'BoxSet',
                        Recursive: true,
                        Fields: 'PrimaryImageAspectRatio,SortName',
                        ImageTypeLimit: 1,
                        EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
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
            return params.topParentId + '-' + 'moviecollections';
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

        const refreshState = createLibraryRefresh({
            view, focus: tabContent, getQuery,
            load: query => {
                this.alphaPicker?.updateControls(query);
                return window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), query);
            },
            render: (result, query) => {
                window.scrollTo(0, 0);
                let html = getCollectionsHtml({ viewStyle: this.getCurrentViewStyle(), query, result });
                bindLibraryPaging({ view: tabContent, query: getQuery(), totalRecordCount: result.TotalRecordCount,
                    isLoading: refreshState.isLoading, getRequestId: refreshState.getRequestId,
                    refresh: () => refreshState.refresh()
                });

                if (!result.Items.length) {
                    html = '';

                    html += '<div class="noItemsMessage centerMessage">';
                    html += '<h1>' + globalize.translate('MessageNothingHere') + '</h1>';
                    html += '<p>' + globalize.translate('MessageNoCollectionsAvailable') + '</p>';
                    html += '</div>';
                }

                const itemsContainer = tabContent.querySelector<HTMLElement>('.itemsContainer')!;
                itemsContainer.innerHTML = html;
                imageLoader.lazyChildren(itemsContainer);
                userSettings.saveQuerySettings(getSavedQueryKey(), query);
            }
        });
        this.destroy = refreshState.destroy;
        this.isRefreshInterrupted = refreshState.isInterrupted;
        const reloadItems = () => refreshState.refreshSafely();

        const data: Record<string, LibraryPageData> = {};

        this.getCurrentViewStyle = () => {
            return getPageData().view;
        };

        const initPage = (tabElement: HTMLElement) => {
            tabElement.querySelector<HTMLElement>('.btnSort')!.addEventListener('click', (e) => {
                libraryBrowser.showSortMenu({
                    items: [{
                        name: globalize.translate('Name'),
                        id: 'SortName'
                    }, {
                        name: globalize.translate('OptionCommunityRating'),
                        id: 'CommunityRating,SortName'
                    }, {
                        name: globalize.translate('OptionDateAdded'),
                        id: 'DateCreated,SortName'
                    }, {
                        name: globalize.translate('OptionParentalRating'),
                        id: 'OfficialRating,SortName'
                    }, {
                        name: globalize.translate('OptionReleaseDate'),
                        id: 'PremiereDate,SortName'
                    }],
                    callback: () => {
                        getQuery().StartIndex = 0;
                        reloadItems();
                    },
                    query: getQuery(),
                    button: e.target as HTMLElement
                });
            });
            const btnSelectView = tabElement.querySelector<HTMLElement>('.btnSelectView')!;
            btnSelectView.addEventListener('click', (e) => {
                libraryBrowser.showLayoutMenu(e.target, this.getCurrentViewStyle(), 'List,Poster,PosterCard,Thumb,ThumbCard'.split(','));
            });
            btnSelectView.addEventListener('layoutchange', (e) => {
                const viewStyle = (e as CustomEvent<{ viewStyle: string }>).detail.viewStyle;
                getPageData().view = viewStyle;
                userSettings.saveViewSetting(getSavedQueryKey(), viewStyle);
                getQuery().StartIndex = 0;
                onViewStyleChange();
                reloadItems();
            });
            const alphaPickerElement = tabElement.querySelector<HTMLElement>('.alphaPicker')!;

            if (alphaPickerElement) {
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
            }
        };

        initPage(tabContent);
        onViewStyleChange();

        this.renderTab = () => {
            this.alphaPicker?.updateControls(getQuery());
            return refreshState.refresh();
        };
    }
}
