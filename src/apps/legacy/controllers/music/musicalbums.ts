import { createLibraryRefresh } from '../libraryRefresh';
import { bindLibraryPaging } from '../libraryPaging';
import { getAlbumsHtml } from '../libraryItemRendering';
import type { LibraryController, LibraryPageData } from '../libraryControllerTypes';
import { playbackManager } from 'components/playback/playbackmanager';
import libraryBrowser from 'scripts/libraryBrowser';
import imageLoader from 'components/images/imageLoader';
import AlphaPicker from 'components/alphaPicker/alphaPicker';
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
        const playAll = () => {
            void window.ApiClient.getItem(window.ApiClient.getCurrentUserId(), params.topParentId!).then((item) => {
                void playbackManager.play({
                    items: [item]
                });
            });
        };

        const shuffle = () => {
            void window.ApiClient.getItem(window.ApiClient.getCurrentUserId(), params.topParentId!).then((item) => {
                getQuery();
                playbackManager.shuffle(item);
            });
        };

        const getPageData = () => {
            const key = getSavedQueryKey();

            if (!pageData) {
                pageData = {
                    query: {
                        SortBy: 'SortName',
                        SortOrder: 'Ascending',
                        IncludeItemTypes: 'MusicAlbum',
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
            return `${params.topParentId}-musicalbums`;
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
                setFilterStatus(tabContent, query);
                return window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), query);
            },
            render: (result, query) => {
                window.scrollTo(0, 0);
                this.alphaPicker?.updateControls(query);
                const html = getAlbumsHtml({ viewStyle: this.getCurrentViewStyle(), query, result });
                bindLibraryPaging({ view: tabContent, query: getQuery(), totalRecordCount: result.TotalRecordCount,
                    isLoading: refreshState.isLoading, getRequestId: refreshState.getRequestId,
                    refresh: () => refreshState.refresh()
                });

                const itemsContainer = tabContent.querySelector<HTMLElement>('.itemsContainer')!;
                itemsContainer.innerHTML = html;
                imageLoader.lazyChildren(itemsContainer);
                userSettings.saveQuerySettings(getSavedQueryKey(), query);
            }
        });
        this.destroy = refreshState.destroy;
        this.isRefreshInterrupted = refreshState.isInterrupted;
        const reloadItems = () => refreshState.refreshSafely();

        let pageData: LibraryPageData | undefined;

        this.showFilterMenu = () => {
            void import('components/filterdialog/filterdialog').then(({ default: FilterDialog }) => {
                const filterDialog = new FilterDialog({
                    query: getQuery(),
                    mode: 'albums',
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

            tabElement.querySelector<HTMLElement>('.btnSort')!.addEventListener('click', (e) => {
                libraryBrowser.showSortMenu({
                    items: [{
                        name: globalize.translate('Name'),
                        id: 'SortName'
                    }, {
                        name: globalize.translate('AlbumArtist'),
                        id: 'AlbumArtist,SortName'
                    }, {
                        name: globalize.translate('OptionCommunityRating'),
                        id: 'CommunityRating,SortName'
                    }, {
                        name: globalize.translate('OptionCriticRating'),
                        id: 'CriticRating,SortName'
                    }, {
                        name: globalize.translate('OptionDateAdded'),
                        id: 'DateCreated,SortName'
                    }, {
                        name: globalize.translate('OptionReleaseDate'),
                        id: 'ProductionYear,PremiereDate,SortName'
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

            tabElement.querySelector<HTMLElement>('.btnPlayAll')!.addEventListener('click', playAll);
            tabElement.querySelector<HTMLElement>('.btnShuffle')!.addEventListener('click', shuffle);
        };

        initPage(tabContent);
        onViewStyleChange();

        this.renderTab = () => {
            this.alphaPicker?.updateControls(getQuery());
            return refreshState.refresh();
        };
    }
}
