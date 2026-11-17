import type { LibraryController, LibraryPageData, LibraryResult } from '../libraryControllerTypes';
import cardBuilder from 'components/cardbuilder/cardBuilder';
import imageLoader from 'components/images/imageLoader';
import libraryBrowser from 'scripts/libraryBrowser';
import loading from 'components/loading/loading';
import * as userSettings from 'scripts/settings/userSettings';
import Events from 'utils/events';
import { clearLiveTvStatus, showLiveTvStatus } from 'components/guide/liveTvStatus';
import { getFilterStatus, setFilterStatus } from 'components/filterdialog/filterIndicator';

import 'components/itemscontainer/emby-itemscontainer';

export default class LibraryTab {
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
            const onNextPageClick = () => {
                if (isLoading) {
                    return;
                }

                if (userSettings.libraryPageSize() > 0) {
                    query.StartIndex += query.Limit!;
                }
                reloadItems(context).then(() => {
                    window.scrollTo(0, 0);
                });
            };

            const onPreviousPageClick = () => {
                if (isLoading) {
                    return;
                }

                if (userSettings.libraryPageSize() > 0) {
                    query.StartIndex = Math.max(0, query.StartIndex - query.Limit!);
                }
                reloadItems(context).then(() => {
                    window.scrollTo(0, 0);
                });
            };

            const query = getQuery();

            clearLiveTvStatus(context);
            for (const elem of context.querySelectorAll('.paging')) {
                elem.classList.toggle('hide', !result.Items.length);
                elem.innerHTML = libraryBrowser.getQueryPagingHtml({
                    startIndex: query.StartIndex,
                    limit: query.Limit,
                    totalRecordCount: result.TotalRecordCount,
                    showLimit: false,
                    updatePageSizeSetting: false,
                    filterButton: false
                });
            }

            if (!result.Items.length) {
                showLiveTvStatus(context, getFilterStatus(query) ? 'LiveTvNoMatchingChannels' : 'LiveTvNoChannels');
            }

            const html = getChannelsHtml(result.Items);
            const elem = context.querySelector<HTMLElement>('#items')!;
            elem.innerHTML = html;
            imageLoader.lazyChildren(elem);
            let i;
            let length;
            let elems;

            for (elems = context.querySelectorAll('.btnNextPage'), i = 0, length = elems.length; i < length; i++) {
                elems[i].addEventListener('click', onNextPageClick);
            }

            for (elems = context.querySelectorAll('.btnPreviousPage'), i = 0, length = elems.length; i < length; i++) {
                elems[i].addEventListener('click', onPreviousPageClick);
            }
        };

        const showFilterMenu = (context: HTMLElement) => {
            void import('components/filterdialog/filterdialog').then(({ default: FilterDialog }) => {
                const filterDialog = new FilterDialog({
                    query: getQuery(),
                    mode: 'livetvchannels',
                    serverId: window.ApiClient.serverId()
                });
                Events.on(filterDialog, 'filterchange', () => {
                    reloadItems(context);
                });
                void filterDialog.show();
            });
        };

        const reloadItems = (context: HTMLElement) => {
            clearLiveTvStatus(context);
            loading.show();
            isLoading = true;
            const query = getQuery();
            setFilterStatus(context, query);

            const apiClient = window.ApiClient;
            query.UserId = apiClient.getCurrentUserId();
            return apiClient.getLiveTvChannels(query).then((response) => {
                // These endpoints return Items and TotalRecordCount for paged library queries.
                const result = response as LibraryResult;
                renderChannels(context, result);
                loading.hide();
                isLoading = false;
            }, () => {
                loading.hide();
                isLoading = false;
                context.querySelector<HTMLElement>('#items')!.innerHTML = '';
                for (const paging of context.querySelectorAll('.paging')) {
                    paging.classList.add('hide');
                }
                showLiveTvStatus(context, 'LiveTvLoadError', () => reloadItems(context));
            }).then(() => {
                void import('components/autoFocuser').then(({ default: autoFocuser }) => {
                    autoFocuser.autoFocus(context);
                });
            });
        };

        let pageData: LibraryPageData | undefined;
        let isLoading = false;
        tabContent.querySelector<HTMLElement>('.btnFilter')!.addEventListener('click', () => {
            showFilterMenu(tabContent);
        });

        this.renderTab = () => {
            reloadItems(tabContent);
        };
    }
}
