import { createLibraryRefresh } from '../libraryRefresh';
import { bindLibraryPaging } from '../libraryPaging';
import type { LibraryController, LibraryPageData, LibraryResult } from '../libraryControllerTypes';
import cardBuilder from 'components/cardbuilder/cardBuilder';
import imageLoader from 'components/images/imageLoader';
import focusManager from 'lib/focusManager';
import * as userSettings from 'scripts/settings/userSettings';
import Events from 'utils/events';
import { clearLiveTvStatus, showLiveTvStatus } from 'components/guide/liveTvStatus';
import { getFilterStatus, setFilterStatus } from 'components/filterdialog/filterIndicator';

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
            if (!pageData) {
                pageData = {
                    query: {
                        StartIndex: 0,
                        Fields: 'PrimaryImageAspectRatio'
                    }
                };
            }

            if (userSettings.libraryPageSize() > 0) {
                pageData.query['Limit'] = userSettings.libraryPageSize();
            }

            return pageData;
        };

        const getQuery = () => {
            return getPageData().query;
        };

        const getChannelsHtml = (channels: LibraryResult['Items']) => {
            return cardBuilder.getCardsHtml({
                items: channels,
                shape: 'square',
                showTitle: true,
                lazy: true,
                cardLayout: true,
                showDetailsMenu: true,
                showCurrentProgram: true,
                showCurrentProgramTime: true
            });
        };

        const renderChannels = (context: HTMLElement, result: LibraryResult) => {
            const query = getQuery();

            clearLiveTvStatus(context);
            for (const elem of context.querySelectorAll('.paging')) {
                elem.classList.toggle('hide', !result.Items.length);
            }

            if (!result.Items.length) {
                showLiveTvStatus(context, getFilterStatus(query) ? 'LiveTvNoMatchingChannels' : 'LiveTvNoChannels');
            }

            const html = getChannelsHtml(result.Items);
            const elem = context.querySelector<HTMLElement>('#items')!;
            elem.innerHTML = html;
            imageLoader.lazyChildren(elem);
            bindLibraryPaging({ view: context, query: getQuery(), totalRecordCount: result.TotalRecordCount,
                isLoading: refreshState.isLoading, getRequestId: refreshState.getRequestId,
                refresh: () => refreshState.refresh()
            });
        };

        const showFilterMenu = () => {
            void import('components/filterdialog/filterdialog').then(({ default: FilterDialog }) => {
                const filterDialog = new FilterDialog({
                    query: getQuery(),
                    mode: 'livetvchannels',
                    serverId: window.ApiClient.serverId()
                });
                Events.on(filterDialog, 'filterchange', () => {
                    reloadItems();
                });
                void filterDialog.show();
            });
        };

        const refreshState = createLibraryRefresh({
            view, focus: tabContent, getQuery,
            load: query => {
                clearLiveTvStatus(tabContent);
                setFilterStatus(tabContent, getQuery());
                query.UserId = window.ApiClient.getCurrentUserId();
                return window.ApiClient.getLiveTvChannels(query);
            },
            render: result => renderChannels(tabContent, result),
            onError: () => {
                tabContent.querySelector<HTMLElement>('#items')!.innerHTML = '';
                for (const paging of tabContent.querySelectorAll('.paging')) {
                    paging.classList.add('hide');
                }
                focusManager.autoFocus(showLiveTvStatus(tabContent, 'LiveTvLoadError', () => refreshState.refreshSafely()), true);
            }
        });
        this.destroy = refreshState.destroy;
        this.isRefreshInterrupted = refreshState.isInterrupted;
        const reloadItems = () => refreshState.refreshSafely();

        let pageData: LibraryPageData | undefined;
        tabContent.querySelector<HTMLElement>('.btnFilter')!.addEventListener('click', () => {
            showFilterMenu();
        });

        this.renderTab = () => {
            return refreshState.refresh();
        };
    }
}
