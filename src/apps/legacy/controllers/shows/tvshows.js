import { bindLibraryPaging, getLibraryLayout, getLibraryLayoutOptions, libraryLayouts, supportedLibraryLayout } from '../libraryPaging';
import loading from 'components/loading/loading';
import libraryBrowser from 'scripts/libraryBrowser';
import imageLoader from 'components/images/imageLoader';
import listView from 'components/listview/listview';
import cardBuilder from 'components/cardbuilder/cardBuilder';
import AlphaPicker from 'components/alphaPicker/alphaPicker';
import * as userSettings from 'scripts/settings/userSettings';
import globalize from 'lib/globalize';
import Events from 'utils/events';
import { setFilterStatus } from 'components/filterdialog/filterIndicator';

import 'elements/emby-itemscontainer/emby-itemscontainer';

export default function (view, params, tabContent) {
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
        const itemsContainer = tabContent.querySelector('.itemsContainer');

        if (viewStyle == 'List') {
            itemsContainer.classList.add('vertical-list');
            itemsContainer.classList.remove('vertical-wrap');
        } else {
            itemsContainer.classList.remove('vertical-list');
            itemsContainer.classList.add('vertical-wrap');
        }

        itemsContainer.innerHTML = '';
    };

    const reloadItems = (page) => {
        loading.show();
        isLoading = true;
        const query = getQuery();
        setFilterStatus(page, query);

        const request = ++requestId;
        return ApiClient.getItems(ApiClient.getCurrentUserId(), { ...query }).then((result) => {
            if (request !== requestId || !active) return;
            window.scrollTo(0, 0);
            this.alphaPicker?.updateControls(query);
            let html;
            bindLibraryPaging({
                view: tabContent, query, totalRecordCount: result.TotalRecordCount,
                isLoading: () => isLoading, getRequestId: () => requestId, refresh: () => reloadItems(tabContent)
            });
            const viewStyle = this.getCurrentViewStyle();
            if (viewStyle === 'List') {
                html = listView.getListViewHtml({ items: result.Items, context: 'tvshows', sortBy: query.SortBy });
            } else {
                const cardOptions = { ...getLibraryLayoutOptions(viewStyle), items: result.Items, context: 'tvshows' };
                if (viewStyle === 'Thumb') delete cardOptions.showYear;
                if (viewStyle === 'Poster') cardOptions.lazy = true;
                if (viewStyle === 'Poster' || viewStyle === 'Thumb') cardOptions.overlayMoreButton = true;
                html = cardBuilder.getCardsHtml(cardOptions);
            }

            const itemsContainer = tabContent.querySelector('.itemsContainer');
            itemsContainer.innerHTML = html;
            imageLoader.lazyChildren(itemsContainer);
            userSettings.saveQuerySettings(getSavedQueryKey(), query);
            import('components/autoFocuser').then(({ default: autoFocuser }) => {
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
    const data = {};
    let isLoading = false;

    this.showFilterMenu = function () {
        import('components/filterdialog/filterdialog').then(({ default: FilterDialog }) => {
            const filterDialog = new FilterDialog({
                query: getQuery(),
                mode: 'series',
                serverId: ApiClient.serverId()
            });
            Events.on(filterDialog, 'filterchange', function () {
                getQuery().StartIndex = 0;
                reloadItems(tabContent).catch(console.error);
            });
            filterDialog.show();
        });
    };

    this.getCurrentViewStyle = function () {
        return supportedLibraryLayout(getPageData().view);
    };

    const initPage = (tabElement) => {
        const alphaPickerElement = tabElement.querySelector('.alphaPicker');
        alphaPickerElement.addEventListener('alphavaluechanged', function (e) {
            const newValue = e.detail.value;
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

        tabElement.querySelector('.btnFilter').addEventListener('click', () => {
            this.showFilterMenu();
        });
        tabElement.querySelector('.btnSort').addEventListener('click', function (e) {
            libraryBrowser.showSortMenu({
                items: [{
                    name: globalize.translate('Name'),
                    id: 'SortName'
                }, {
                    name: globalize.translate('OptionRandom'),
                    id: 'Random'
                }, {
                    name: globalize.translate('OptionCommunityRating'),
                    id: 'CommunityRating,SortName'
                }, {
                    name: globalize.translate('OptionDateShowAdded'),
                    id: 'DateCreated,SortName'
                }, {
                    name: globalize.translate('OptionDateEpisodeAdded'),
                    id: 'DateLastContentAdded,SortName'
                }, {
                    name: globalize.translate('OptionDatePlayed'),
                    id: 'SeriesDatePlayed,SortName'
                }, {
                    name: globalize.translate('OptionParentalRating'),
                    id: 'OfficialRating,SortName'
                }, {
                    name: globalize.translate('OptionReleaseDate'),
                    id: 'PremiereDate,SortName'
                }],
                callback: function () {
                    getQuery().StartIndex = 0;
                    reloadItems(tabElement).catch(console.error);
                },
                query: getQuery(),
                button: e.target
            });
        });
        const btnSelectView = tabElement.querySelector('.btnSelectView');
        btnSelectView.addEventListener('click', (e) => {
            libraryBrowser.showLayoutMenu(e.target, this.getCurrentViewStyle(), libraryLayouts);
        });
        btnSelectView.addEventListener('layoutchange', function (e) {
            const viewStyle = e.detail.viewStyle;
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

