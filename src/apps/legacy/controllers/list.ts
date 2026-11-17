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
import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import type { ItemDto } from 'types/base/models/item-dto';
import { getItems, getItem } from './list/queries';
import { ListSettings } from './list/settings';
import { getItemsHtml } from './list/presentation';
import { getTitle } from './list/title';
import { updateSortText, updateItemsContainerForViewType, updateAlphaPickerState, showViewSettingsMenu, showFilterMenu, showSortMenu, hideOrShowAll, bindAll } from './list/controls';
import type { ListParams, ListResult, ListItemsContainer } from './list/types';

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
                    if (focusRequestId === requestId && this.itemsContainer && !this.itemsContainer.paused) {
                        window.scrollTo(0, 0);
                        autoFocus();
                    }
                }
            });
        }

        const fetchData = () => {
            const request = ++requestId;
            isLoading = true;

            return getItems(this, params, this.currentItem, null, query.StartIndex, query.Limit).then((result: ListResult) => {
                if (request !== requestId || this.itemsContainer?.paused) return result;
                if (this.totalItemCount == null) {
                    this.totalItemCount = result.Items ? result.Items.length : result.length;
                }

                updateAlphaPickerState(this);
                return result;
            }).finally(() => {
                if (request === requestId) isLoading = false;
            });
        }

        const initAlphaPicker = () => {
            this.scroller = view.querySelector<HTMLElement>('.scrollFrameY');
            const alphaPickerElement = this.alphaPickerElement;

            view.querySelector('.itemsViewSettingsContainer')!.appendChild(alphaPickerElement!);
            this.alphaPicker = new AlphaPicker({
                element: alphaPickerElement!,
                valueChangeEvent: 'click'
            });
            this.alphaPicker.on('alphavaluechanged', onAlphaPickerValueChanged);
        }

        const onAlphaPickerValueChanged = () => {
            query.StartIndex = 0;
            this.itemsContainer.refreshItems();
        }

        const setTitle = (item: ItemDto | null) => {
            LibraryMenu.setTitle(getTitle(params, item) || '');
        }

        const play = () => {
            const currentItem = this.currentItem;

            if (currentItem && !this.hasFilters) {
                const values = this.getSortValues();
                playbackManager.play({
                    items: [currentItem],
                    queryOptions: {
                        SortBy: values.sortBy,
                        SortOrder: values.sortOrder
                    },
                    autoplay: true
                });
            } else {
                getItems(this, this.params, currentItem, null, 0, 300).then((result: ListResult) => {
                    playbackManager.play({
                        items: result.Items!,
                        autoplay: true
                    });
                });
            }
        }

        const queue = () => {
            const currentItem = this.currentItem;

            if (currentItem && !this.hasFilters) {
                playbackManager.queue({
                    items: [currentItem]
                });
            } else {
                getItems(this, this.params, currentItem, null, 0, 300).then((result: ListResult) => {
                    playbackManager.queue({
                        items: result.Items!
                    });
                });
            }
        }

        const shuffle = () => {
            const currentItem = this.currentItem;

            if (currentItem && !this.hasFilters) {
                playbackManager.shuffle(currentItem);
            } else {
                getItems(this, this.params, currentItem, 'Random', 0, 300).then((result: ListResult) => {
                    playbackManager.play({
                        items: result.Items!,
                        autoplay: true
                    });
                });
            }
        }

        const autoFocus = () => {
            const request = requestId;
            import('components/autoFocuser').then(({ default: autoFocuser }) => {
                if (request === requestId && this.itemsContainer && !this.itemsContainer.paused) {
                    autoFocuser.autoFocus(view);
                }
            });
        }

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
        view.addEventListener('viewshow', (e: Event) => {
            const isRestored = (e as CustomEvent<{ isRestored: boolean }>).detail.isRestored;

            if (!isRestored) {
                loading.show();
                updateSortText(this);
                updateItemsContainerForViewType(this);
            }

            setTitle(null);
            getItem(params).then((item: ItemDto | null) => {
                setTitle(item);
                if (item && item.Type == 'Genre') {
                    item.ParentId = params.parentId;
                }

                this.currentItem = item;
                const refresh = !isRestored;
                this.itemsContainer.resume({
                    refresh: refresh
                }).then(() => {
                    loading.hide();

                    if (refresh) {
                        focusManager.autoFocus(this.itemsContainer);
                    }
                });

                if (!isRestored && item && item.Type !== 'PhotoAlbum') {
                    initAlphaPicker();
                }

                const itemType = item ? item.Type : null;

                if ((itemType === 'MusicGenre' || params.type !== 'Programs' && itemType !== 'Channel')
                    // Folder, Playlist views
                    && itemType !== 'UserView'
                    // Only Photo (homevideos) and Music Video CollectionFolders are supported
                    && !(itemType === 'CollectionFolder' && item?.CollectionType !== CollectionType.Homevideos && item?.CollectionType !== CollectionType.Musicvideos)
                ) {
                    // Show Play All buttons
                    hideOrShowAll(view.querySelectorAll<HTMLElement>('.btnPlay'), false);
                } else {
                    // Hide Play All buttons
                    hideOrShowAll(view.querySelectorAll<HTMLElement>('.btnPlay'), true);
                }

                if ((itemType === 'MusicGenre' || params.type !== 'Programs' && params.type !== 'nextup' && itemType !== 'Channel')
                    // Folder, Playlist views
                    && itemType !== 'UserView'
                    // Only Photo (homevideos) and Music Video CollectionFolders are supported
                    && !(itemType === 'CollectionFolder' && item?.CollectionType !== CollectionType.Homevideos && item?.CollectionType !== CollectionType.Musicvideos)
                ) {
                    // Show Shuffle buttons
                    hideOrShowAll(view.querySelectorAll<HTMLElement>('.btnShuffle'), false);
                } else {
                    // Hide Shuffle buttons
                    hideOrShowAll(view.querySelectorAll<HTMLElement>('.btnShuffle'), true);
                }

                if (item && playbackManager.canQueue(item)) {
                    // Show Queue button
                    hideOrShowAll(view.querySelectorAll<HTMLElement>('.btnQueue'), false);
                } else {
                    // Hide Queue button
                    hideOrShowAll(view.querySelectorAll<HTMLElement>('.btnQueue'), true);
                }
            });

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
