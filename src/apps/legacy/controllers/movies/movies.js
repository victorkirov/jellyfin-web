import { bindLibraryPaging, getLibraryLayout, getLibraryLayoutOptions, libraryLayouts } from '../libraryPaging';
import loading from 'components/loading/loading';
import * as userSettings from 'scripts/settings/userSettings';
import libraryBrowser from 'scripts/libraryBrowser';
import { AlphaPicker } from 'components/alphaPicker/alphaPicker';
import listView from 'components/listview/listview';
import cardBuilder from 'components/cardbuilder/cardBuilder';
import globalize from 'lib/globalize';
import Events from 'utils/events';
import { playbackManager } from 'components/playback/playbackmanager';
import { getFilterStatus, setFilterStatus } from 'components/filterdialog/filterIndicator';

import 'elements/emby-itemscontainer/emby-itemscontainer';

export default function (view, params, tabContent, options) {
    const onViewStyleChange = () => {
        if (this.getCurrentViewStyle() == 'List') {
            itemsContainer.classList.add('vertical-list');
            itemsContainer.classList.remove('vertical-wrap');
        } else {
            itemsContainer.classList.remove('vertical-list');
            itemsContainer.classList.add('vertical-wrap');
        }

        itemsContainer.innerHTML = '';
    };

    function fetchData() {
        isLoading = true;
        loading.show();
        const request = ++requestId;
        return ApiClient.getItems(ApiClient.getCurrentUserId(), { ...query }).finally(() => {
            if (request === requestId) {
                isLoading = false;
                loading.hide();
            }
        });
    }

    function playAll() {
        ApiClient.getItem(ApiClient.getCurrentUserId(), params.topParentId).then(function (item) {
            playbackManager.play({
                items: [item]
            });
        });
    }

    function shuffle() {
        isLoading = true;
        loading.show();
        const newQuery = { ...query, SortBy: 'Random', StartIndex: 0, Limit: 300, Fields: 'PrimaryImageAspectRatio,MediaSourceCount,Chapters,Trickplay' };
        return ApiClient.getItems(ApiClient.getCurrentUserId(), newQuery).then(({ Items }) => {
            playbackManager.play({
                items: Items,
                autoplay: true
            });
        }).finally(() => {
            isLoading = false;
            loading.hide();
        });
    }

    const afterRefresh = (result) => {
        setFilterStatus(tabContent, query);

        window.scrollTo(0, 0);
        this.alphaPicker?.updateControls(query);
        bindLibraryPaging({
            view: tabContent, query, totalRecordCount: result.TotalRecordCount,
            isLoading: () => isLoading, getRequestId: () => requestId,
            refresh: () => itemsContainer.refreshItems()
        });

        tabContent.querySelector('.btnPlayAll')?.classList.toggle('hide', result.TotalRecordCount < 1);
        tabContent.querySelector('.btnShuffle')?.classList.toggle('hide', result.TotalRecordCount < 1);

        const request = requestId;
        import('components/autoFocuser').then(({ default: autoFocuser }) => {
            if (request === requestId && active && itemsContainer) autoFocuser.autoFocus(tabContent);
        });
    };

    const getItemsHtml = (items) => {
        const viewStyle = this.getCurrentViewStyle();
        if (viewStyle === 'List') {
            return listView.getListViewHtml({ items, context: 'movies', sortBy: query.SortBy });
        }
        const cardOptions = { ...getLibraryLayoutOptions(viewStyle), items, context: 'movies' };
        if (viewStyle !== 'Poster') cardOptions.lazy = true;
        if (viewStyle === 'Poster' || viewStyle === 'Thumb') cardOptions.overlayPlayButton = true;
        return cardBuilder.getCardsHtml(cardOptions);
    };

    const initPage = (tabElement) => {
        itemsContainer.fetchData = fetchData;
        itemsContainer.getItemsHtml = getItemsHtml;
        itemsContainer.afterRefresh = afterRefresh;
        const alphaPickerElement = tabElement.querySelector('.alphaPicker');

        if (alphaPickerElement) {
            alphaPickerElement.addEventListener('alphavaluechanged', function (e) {
                const newValue = e.detail.value;
                if (newValue === '#') {
                    query.NameLessThan = 'A';
                    delete query.NameStartsWith;
                } else {
                    query.NameStartsWith = newValue;
                    delete query.NameLessThan;
                }
                query.StartIndex = 0;
                itemsContainer.refreshItems().catch(console.error);
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
                    items: [{
                        name: globalize.translate('Name'),
                        id: 'SortName,ProductionYear'
                    }, {
                        name: globalize.translate('OptionRandom'),
                        id: 'Random'
                    }, {
                        name: globalize.translate('OptionCommunityRating'),
                        id: 'CommunityRating,SortName,ProductionYear'
                    }, {
                        name: globalize.translate('OptionCriticRating'),
                        id: 'CriticRating,SortName,ProductionYear'
                    }, {
                        name: globalize.translate('OptionDateAdded'),
                        id: 'DateCreated,SortName,ProductionYear'
                    }, {
                        name: globalize.translate('OptionDatePlayed'),
                        id: 'DatePlayed,SortName,ProductionYear'
                    }, {
                        name: globalize.translate('OptionParentalRating'),
                        id: 'OfficialRating,SortName,ProductionYear'
                    }, {
                        name: globalize.translate('OptionPlayCount'),
                        id: 'PlayCount,SortName,ProductionYear'
                    }, {
                        name: globalize.translate('OptionReleaseDate'),
                        id: 'PremiereDate,SortName,ProductionYear'
                    }, {
                        name: globalize.translate('Runtime'),
                        id: 'Runtime,SortName,ProductionYear'
                    }],
                    callback: function () {
                        query.StartIndex = 0;
                        userSettings.saveQuerySettings(savedQueryKey, query);
                        itemsContainer.refreshItems().catch(console.error);
                    },
                    query: query,
                    button: e.target
                });
            });
        }
        const btnSelectView = tabElement.querySelector('.btnSelectView');
        btnSelectView.addEventListener('click', (e) => {
            libraryBrowser.showLayoutMenu(e.target, this.getCurrentViewStyle(), libraryLayouts);
        });
        btnSelectView.addEventListener('layoutchange', function (e) {
            const viewStyle = e.detail.viewStyle;
            userSettings.set(savedViewKey, viewStyle);
            query.StartIndex = 0;
            onViewStyleChange();
            itemsContainer.refreshItems().catch(console.error);
        });

        tabElement.querySelector('.btnPlayAll').addEventListener('click', playAll);
        tabElement.querySelector('.btnShuffle')?.addEventListener('click', shuffle);
    };

    let itemsContainer = tabContent.querySelector('.itemsContainer');
    const savedQueryKey = params.topParentId + '-' + options.mode;
    const savedViewKey = savedQueryKey + '-view';
    let requestId = 0;
    let active = true;
    let query = {
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
        import('components/filterdialog/filterdialog').then(({ default: FilterDialog }) => {
            const filterDialog = new FilterDialog({
                query: query,
                mode: 'movies',
                serverId: ApiClient.serverId(),
                hasFilters: getFilterStatus(query)
            });
            Events.on(filterDialog, 'filterchange', () => {
                query.StartIndex = 0;
                userSettings.saveQuerySettings(savedQueryKey, query);
                itemsContainer.refreshItems().catch(console.error);
            });
            filterDialog.show();
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
        return itemsContainer.refreshItems();
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
