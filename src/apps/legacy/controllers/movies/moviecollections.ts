import { getCollectionsHtml } from '../libraryItemRendering';
import type { LibraryController, LibraryPageData, LibraryResult } from '../libraryControllerTypes';
import loading from 'components/loading/loading';
import libraryBrowser from 'scripts/libraryBrowser';
import { AlphaPicker } from 'components/alphaPicker/alphaPicker';
import imageLoader from 'components/images/imageLoader';
import * as userSettings from 'scripts/settings/userSettings';
import globalize from 'lib/globalize';
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

        const reloadItems = (page: HTMLElement = tabContent) => {
            loading.show();
            isLoading = true;
            const query = getQuery();
            this.alphaPicker?.updateControls(query);
            void window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), query).then((response) => {
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
                html = getCollectionsHtml({ viewStyle: this.getCurrentViewStyle(), query, result });
                let elems = tabContent.querySelectorAll('.paging');

                for (const elem of elems) {
                    elem.innerHTML = pagingHtml;
                }

                elems = tabContent.querySelectorAll('.btnNextPage');
                for (const elem of elems) {
                    elem.addEventListener('click', onNextPageClick);
                }

                elems = tabContent.querySelectorAll('.btnPreviousPage');
                for (const elem of elems) {
                    elem.addEventListener('click', onPreviousPageClick);
                }

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
                loading.hide();
                isLoading = false;

                void import('components/autoFocuser').then(({ default: autoFocuser }) => {
                    autoFocuser.autoFocus(page);
                });
            });
        };

        const data: Record<string, LibraryPageData> = {};
        let isLoading = false;

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
                        reloadItems(tabElement);
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
                reloadItems(tabElement);
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
                    reloadItems(tabElement);
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
            reloadItems(tabContent);
            this.alphaPicker?.updateControls(getQuery());
        };
    }


    }
