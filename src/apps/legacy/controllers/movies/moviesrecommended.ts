import { bindLibraryRail } from '../libraryRail';
import * as mainTabsManager from 'components/maintabsmanager';
import createTabControllerCache from '../tabControllerCache';
import ServerConnections from 'lib/jellyfin-apiclient/ServerConnections';
import { queryClient } from 'utils/query/queryClient';
import { userQueryKey } from 'utils/query/queryKeys';

import { playbackManager } from 'components/playback/playbackmanager';
import globalize from 'lib/globalize';
import inputManager from 'scripts/inputManager';
import libraryMenu from 'scripts/libraryMenu';
import Dashboard from 'components/dashboard';
import Events from 'utils/events';

import 'elements/emby-scroller/emby-scroller';
import 'components/itemscontainer/emby-itemscontainer';
import 'elements/emby-tabs/emby-tabs';
import 'components/buttons/emby-button';

import { getTabs, getDefaultTabIndex, initSuggestedTab, loadSuggestionsTab } from './movieSuggestions';
import type { RecommendedParams } from '../recommendedTypes';
import type { PlaybackStopInfo } from 'types/playbackStopInfo';
export default class RecommendedPage {
    tabContent?: HTMLElement;
    initTab!: () => void;
    renderTab!: () => void;
    _unsubscribeUserData?: (() => void) | null;

    constructor(view: HTMLElement, params: RecommendedParams) {
        bindLibraryRail(view);
        const onBeforeTabChange = (e: CustomEvent<{ selectedTabIndex: string }>) => {
            void tabs.preload(parseInt(e.detail.selectedTabIndex, 10));
        };

        const onTabChange = (e: CustomEvent<{ selectedTabIndex: string }>) => {
            currentTabIndex = parseInt(e.detail.selectedTabIndex, 10);
            void tabs.render(currentTabIndex);
        };

        const getTabContainers = () => {
            return view.querySelectorAll<HTMLElement>('.pageTabContent');
        };

        const initTabs = () => {
            mainTabsManager.setTabs(view, currentTabIndex, getTabs, getTabContainers, onBeforeTabChange, onTabChange, undefined);
        };

        const tabs = createTabControllerCache((index: number) => {
            const tabContent = view.querySelector<HTMLElement>(".pageTabContent[data-index='" + index + "']")!;
            if (index === suggestionsTabIndex) {
                this.tabContent = tabContent;
                return Promise.resolve(this);
            }

            let depends = 'movies';

            switch (index) {
                case 3:
                    depends = 'moviecollections';
                    break;

                case 4:
                    depends = 'moviegenres';
                    break;
            }

            return import(
                /* webpackInclude: /(?:^|\/)(?:movies|moviecollections|moviegenres)\.(?:js|ts)$/ */
                `../movies/${depends}`
            ).then(({ default: ControllerFactory }) => {
                if (index === 0 || index === 2) {
                    return new ControllerFactory(view, params, tabContent, {
                        mode: index ? 'favorites' : 'movies'
                    });
                }
                return new ControllerFactory(view, params, tabContent);
            });
        });

        const onPlaybackStop = (_event: { type: string }, stopInfo: PlaybackStopInfo) => {
            const state = stopInfo.state;

            if (state.NowPlayingItem && state.NowPlayingItem.MediaType == 'Video') {
                const api = ServerConnections.getApi(window.ApiClient.serverId());
                void queryClient.invalidateQueries({ queryKey: userQueryKey(api, window.ApiClient.getCurrentUserId(), 'LatestMedia') });
                tabs.reset();
                // The tab manager returns the registered emby-tabs element.
                (mainTabsManager.getTabsElement() as HTMLElement & { triggerTabChange(): void }).triggerTabChange();
            }
        };

        const onInputCommand: EventListener = (event) => {
            // inputManager dispatches command CustomEvents with this detail.
            const command = (event as CustomEvent<{ command: string }>).detail.command;
            if (command === 'search') {
                event.preventDefault();
                void Dashboard.navigate('search?collectionType=movies&parentId=' + params.topParentId);
            }
        };

        let currentTabIndex = parseInt(String(params.tab || getDefaultTabIndex(params.topParentId)), 10);
        const suggestionsTabIndex = 1;

        this.initTab = () => {
            const tabContent = view.querySelector<HTMLElement>(".pageTabContent[data-index='" + suggestionsTabIndex + "']")!;
            initSuggestedTab(view, tabContent);
        };

        this.renderTab = () => {
            const tabContent = view.querySelector<HTMLElement>(".pageTabContent[data-index='" + suggestionsTabIndex + "']")!;
            void loadSuggestionsTab(view, params, tabContent);
        };

        view.addEventListener('viewshow', () => {
            initTabs();
            if (!view.getAttribute('data-title')) {
                const parentId = params.topParentId;

                if (parentId) {
                    void window.ApiClient.getItem(window.ApiClient.getCurrentUserId(), parentId).then((item) => {
                        view.setAttribute('data-title', item.Name!);
                        libraryMenu.setTitle(item.Name!);
                    });
                } else {
                    view.setAttribute('data-title', globalize.translate('Movies'));
                    libraryMenu.setTitle(globalize.translate('Movies'));
                }
            }

            Events.on(playbackManager, 'playbackstop', onPlaybackStop);
            inputManager.on(window, onInputCommand);
        });
        view.addEventListener('viewbeforehide', () => {
            tabs.pause();
            inputManager.off(window, onInputCommand);
            Events.off(playbackManager, 'playbackstop', onPlaybackStop);
        });
        view.addEventListener('viewdestroy', () => {
            tabs.destroy();
        });
    }
}
