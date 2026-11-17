import { bindLibraryPaging } from './libraryPaging';
import * as userSettings from 'scripts/settings/userSettings';
import focusManager from 'lib/focusManager';
import loading from 'components/loading/loading';
import AlphaNumericShortcuts from 'scripts/alphanumericshortcuts';
import { playbackManager } from 'components/playback/playbackmanager';
import AlphaPicker from 'components/alphaPicker/alphaPicker';
import 'components/itemscontainer/emby-itemscontainer';
import 'elements/emby-scroller/emby-scroller';
import LibraryMenu from 'scripts/libraryMenu';
import type { ItemDto } from 'types/base/models/item-dto';
import { getItems, getItem } from './list/queries';
import { ListSettings } from './list/settings';
import { getItemsHtml } from './list/presentation';
import { getTitle } from './list/title';
import { updateSortText, updateItemsContainerForViewType, updateAlphaPickerState, showViewSettingsMenu, showFilterMenu, showSortMenu, hideOrShowAll, bindAll } from './list/controls';
import type { ListParams, ListResult, ListItemsContainer } from './list/types';
import { canPlayList } from './list/policies';
import { clearListLoadStatus, showListLoadStatus } from './list/loadStatus';

class ItemsView extends ListSettings {
    constructor(view: HTMLElement, params: ListParams) {
        super(params);
        const query: { StartIndex: number; Limit?: number } = {
            StartIndex: 0,
            Limit: undefined
        };

        if (userSettings.libraryPageSize() > 0) {
            query['Limit'] = userSettings.libraryPageSize();
        }

        let isLoading = false;
        let requestId = 0;
        let loadId = 0;
        let active = true;
        let destroyed = false;
        let loadingVisible = false;
        let contentLoaded = false;

        const hideLoading = () => {
            if (loadingVisible) {
                loadingVisible = false;
                loading.hide();
            }
        };

        const invalidateLoad = () => {
            active = false;
            loadId++;
            requestId++;
            hideLoading();
            clearListLoadStatus(view);
        };

        const updatePaging = (result: ListResult) => {
            let focusRequestId: number;
            bindLibraryPaging({
                view, query, totalRecordCount: result.TotalRecordCount,
                isLoading: () => isLoading, getRequestId: () => requestId,
                refresh: () => {
                    const refresh = this.itemsContainer.refreshItems();
                    focusRequestId = requestId;
                    return refresh;
                },
                focus: () => {
                    if (active && focusRequestId === requestId && this.itemsContainer && !this.itemsContainer.paused) {
                        window.scrollTo(0, 0);
                        autoFocus();
                    }
                }
            });
        };

        const fetchData = () => {
            const request = ++requestId;
            isLoading = true;

            return getItems(this, params, this.currentItem, null, query.StartIndex, query.Limit).then((result: ListResult) => {
                if (request !== requestId || !active || this.itemsContainer?.paused) return result;
                if (this.totalItemCount == null) {
                    this.totalItemCount = result.Items ? result.Items.length : result.length;
                }

                updateAlphaPickerState(this);
                return result;
            }).finally(() => {
                if (request === requestId) isLoading = false;
            });
        };

        const initAlphaPicker = () => {
            this.scroller = view.querySelector<HTMLElement>('.scrollFrameY');
            const alphaPickerElement = this.alphaPickerElement;

            view.querySelector('.itemsViewSettingsContainer')!.appendChild(alphaPickerElement!);
            this.alphaPicker = new AlphaPicker({
                element: alphaPickerElement!,
                valueChangeEvent: 'click'
            });
            this.alphaPicker.on('alphavaluechanged', onAlphaPickerValueChanged);
        };

        const onAlphaPickerValueChanged = () => {
            query.StartIndex = 0;
            void this.itemsContainer.refreshItems();
        };

        const setTitle = (item: ItemDto | null) => {
            LibraryMenu.setTitle(getTitle(params, item) || '');
        };

        const play = () => {
            const currentItem = this.currentItem;

            if (currentItem && !this.hasFilters) {
                const values = this.getSortValues();
                void playbackManager.play({
                    items: [currentItem],
                    queryOptions: {
                        SortBy: values.sortBy,
                        SortOrder: values.sortOrder
                    },
                    autoplay: true
                });
            } else {
                void getItems(this, this.params, currentItem, null, 0, 300).then((result: ListResult) => {
                    void playbackManager.play({
                        items: result.Items!,
                        autoplay: true
                    });
                });
            }
        };

        const queue = () => {
            const currentItem = this.currentItem;

            if (currentItem && !this.hasFilters) {
                void playbackManager.queue({
                    items: [currentItem]
                });
            } else {
                void getItems(this, this.params, currentItem, null, 0, 300).then((result: ListResult) => {
                    void playbackManager.queue({
                        items: result.Items!
                    });
                });
            }
        };

        const shuffle = () => {
            const currentItem = this.currentItem;

            if (currentItem && !this.hasFilters) {
                playbackManager.shuffle(currentItem);
            } else {
                void getItems(this, this.params, currentItem, 'Random', 0, 300).then((result: ListResult) => {
                    void playbackManager.play({
                        items: result.Items!,
                        autoplay: true
                    });
                });
            }
        };

        const autoFocus = () => {
            const request = requestId;
            void import('components/autoFocuser').then(({ default: autoFocuser }) => {
                if (active && request === requestId && this.itemsContainer && !this.itemsContainer.paused) {
                    autoFocuser.autoFocus(view);
                }
            });
        };

        this.itemsContainer = view.querySelector<ListItemsContainer>('.itemsContainer')!;

        if (params.parentId) {
            this.itemsContainer.setAttribute('data-parentid', params.parentId);
        } else if (params.type === 'nextup') {
            this.itemsContainer.setAttribute('data-monitor', 'videoplayback');
        } else if (params.type === 'favoritemovies') {
            this.itemsContainer.setAttribute('data-monitor', 'markfavorite');
        } else if (params.type === 'Programs') {
            this.itemsContainer.setAttribute('data-refreshinterval', '300000');
        }

        const btnViewSettings = view.querySelectorAll<HTMLElement>('.btnViewSettings');

        for (const btnViewSetting of btnViewSettings) {
            btnViewSetting.addEventListener('click', showViewSettingsMenu.bind(this));
        }

        const filterButtons = view.querySelectorAll<HTMLElement>('.btnFilter');
        this.filterButtons = filterButtons;
        const hasVisibleFilters = this.getVisibleFilters().length;

        for (const btnFilter of filterButtons) {
            btnFilter.addEventListener('click', showFilterMenu.bind(this));

            if (hasVisibleFilters) {
                btnFilter.classList.remove('hide');
            } else {
                btnFilter.classList.add('hide');
            }
        }

        const sortButtons = view.querySelectorAll<HTMLElement>('.btnSort');

        this.sortButtons = sortButtons;
        for (const sortButton of sortButtons) {
            sortButton.addEventListener('click', showSortMenu.bind(this));

            if (params.type !== 'nextup') {
                sortButton.classList.remove('hide');
            }
        }

        this.btnSortText = view.querySelector<HTMLElement>('.btnSortText');
        this.btnSortIcon = view.querySelector<HTMLElement>('.btnSortIcon');
        this.alphaPickerElement = view.querySelector<HTMLElement>('.alphaPicker');
        this.itemsContainer.fetchData = fetchData;
        this.itemsContainer.getItemsHtml = items => getItemsHtml(this, params, items);
        this.itemsContainer.afterRefresh = updatePaging;
        const loadView = async (isRestored: boolean): Promise<void> => {
            const request = ++loadId;
            const refresh = !isRestored || !contentLoaded;
            if (refresh) contentLoaded = false;
            active = true;
            const isCurrent = () => active && !destroyed && request === loadId;
            clearListLoadStatus(view);
            if (refresh) {
                loading.show();
                loadingVisible = true;
                updateSortText(this);
                updateItemsContainerForViewType(this);
            }
            setTitle(null);
            try {
                const item: ItemDto | null = await getItem(params);
                if (!isCurrent()) return;
                setTitle(item);
                if (item?.Type === 'Genre') item.ParentId = params.parentId;
                this.currentItem = item;
                if (refresh && item && item.Type !== 'PhotoAlbum' && !this.alphaPicker) initAlphaPicker();
                const canPlay = canPlayList(item, params);
                hideOrShowAll(view.querySelectorAll<HTMLElement>('.btnPlay'), !canPlay);
                hideOrShowAll(view.querySelectorAll<HTMLElement>('.btnShuffle'), !canPlay || params.type === 'nextup');
                hideOrShowAll(view.querySelectorAll<HTMLElement>('.btnQueue'), !item || !playbackManager.canQueue(item));
                await this.itemsContainer.resume({ refresh });
                if (!isCurrent()) return;
                contentLoaded = true;
                hideLoading();
                if (refresh) focusManager.autoFocus(this.itemsContainer);
            } catch (error) {
                if (!isCurrent()) return;
                contentLoaded = false;
                console.error('Error loading list', error);
                hideLoading();
                const retryButton = showListLoadStatus(view, () => {
                    void loadView(false);
                });
                focusManager.autoFocus(retryButton.parentElement);
            }
        };

        view.addEventListener('viewshow', (event: Event) => {
            if (destroyed) return;
            const isRestored = Boolean((event as CustomEvent<{ isRestored: boolean }>).detail?.isRestored);
            void loadView(isRestored);

            if (!isRestored) {
                bindAll(view.querySelectorAll<HTMLElement>('.btnPlay'), 'click', play);
                bindAll(view.querySelectorAll<HTMLElement>('.btnQueue'), 'click', queue);
                bindAll(view.querySelectorAll<HTMLElement>('.btnShuffle'), 'click', shuffle);
            }

            this.alphaNumericShortcuts = new AlphaNumericShortcuts({
                itemsContainer: this.itemsContainer
            });
        });
        view.addEventListener('viewhide', () => {
            invalidateLoad();
            const itemsContainer = this.itemsContainer;

            if (itemsContainer) {
                itemsContainer.pause();
            }

            const alphaNumericShortcuts = this.alphaNumericShortcuts;

            if (alphaNumericShortcuts) {
                alphaNumericShortcuts.destroy();
                this.alphaNumericShortcuts = null;
            }
        });
        view.addEventListener('viewdestroy', () => {
            destroyed = true;
            invalidateLoad();
            this.alphaNumericShortcuts?.destroy();
            this.alphaNumericShortcuts = null;
            if (this.listController) {
                this.listController.destroy();
            }

            if (this.alphaPicker) {
                this.alphaPicker.off('alphavaluechanged', onAlphaPickerValueChanged);
                this.alphaPicker.destroy();
            }

            this.currentItem = null;
            this.scroller = null;
            this.itemsContainer = null!;
            this.filterButtons = null!;
            this.sortButtons = null!;
            this.btnSortText = null;
            this.btnSortIcon = null;
            this.alphaPickerElement = null;
        });
    }
}

export default ItemsView;
