import * as mainTabsManager from 'components/maintabsmanager';
import createTabControllerCache from '../tabControllerCache';
import layoutManager from 'lib/layoutManager';
import loading from 'components/loading/loading';
import browser from 'scripts/browser';
import globalize from 'lib/globalize';
import inputManager from 'scripts/inputManager';
import libraryMenu from 'scripts/libraryMenu';
import Dashboard from 'components/dashboard';

import 'components/itemscontainer/emby-itemscontainer';
import 'elements/emby-tabs/emby-tabs';
import 'components/buttons/emby-button';

import 'styles/flexstyles.scss';
import 'styles/scrollstyles.scss';

import { getTabs, getDefaultTabIndex, loadSuggestionsTab } from './musicSuggestions';
import type { RecommendedParams } from '../recommendedTypes';
export default class RecommendedPage {
    tabContent?: HTMLElement;
    initTab!: () => void;
    renderTab!: () => void;
    _unsubscribeUserData?: (() => void) | null;

    constructor(view: HTMLElement, params: RecommendedParams) {
        const reload = () => {
            loading.show();
            const tabContent = view.querySelector<HTMLElement>(".pageTabContent[data-index='" + suggestionsTabIndex + "']")!;
            loadSuggestionsTab(view, tabContent, params.topParentId);
        };

        const setScrollClasses = (elem: HTMLElement, scrollX: boolean) => {
            if (scrollX) {
                elem.classList.add('hiddenScrollX');

                if (layoutManager.tv) {
                    elem.classList.add('smoothScrollX');
                }

                elem.classList.add('scrollX');
                elem.classList.remove('vertical-wrap');
            } else {
                elem.classList.remove('hiddenScrollX');
                elem.classList.remove('smoothScrollX');
                elem.classList.remove('scrollX');
                elem.classList.add('vertical-wrap');
            }
        };

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

        const getMode = (index: number) => {
            if (index === 2) {
                return 'albumartists';
            } else if (index === 3) {
                return 'artists';
            }
        };

        const tabs = createTabControllerCache((index: number) => {
            const tabContent = view.querySelector<HTMLElement>(".pageTabContent[data-index='" + index + "']")!;
            if (index === suggestionsTabIndex) {
                this.tabContent = tabContent;
                return Promise.resolve(this);
            }

            let depends;

            switch (index) {
                case 0:
                    depends = 'musicalbums';
                    break;

                case 2:
                case 3:
                    depends = 'musicartists';
                    break;

                case 4:
                    depends = 'musicplaylists';
                    break;

                case 5:
                    depends = 'songs';
                    break;

                case 6:
                    depends = 'musicgenres';
                    break;
            }

            return import(
                /* webpackInclude: /(?:^|\/)(?:musicalbums|musicartists|musicplaylists|songs|musicgenres)\.(?:js|ts)$/ */
                `../music/${depends}`
            ).then(({ default: ControllerFactory }) => {
                return new ControllerFactory(view, params, tabContent, {
                    mode: getMode(index)
                });
            });
        });

        const onInputCommand = (e: CustomEvent<{ command: string }>) => {
            if (e.detail.command === 'search') {
                e.preventDefault();
                void Dashboard.navigate('search?collectionType=music&parentId=' + params.topParentId);
            }
        };

        let currentTabIndex = parseInt(String(params.tab || getDefaultTabIndex(params.topParentId)), 10);
        const suggestionsTabIndex = 1;

        this.initTab = () => {
            const tabContent = view.querySelector<HTMLElement>(".pageTabContent[data-index='" + suggestionsTabIndex + "']")!;
            const containers = tabContent.querySelectorAll<HTMLElement>('.itemsContainer');

            for (let i = 0, length = containers.length; i < length; i++) {
                setScrollClasses(containers[i], browser.mobile);
            }
        };

        this.renderTab = () => {
            reload();
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
                    view.setAttribute('data-title', globalize.translate('TabMusic'));
                    libraryMenu.setTitle(globalize.translate('TabMusic'));
                }
            }

            inputManager.on(window, onInputCommand);
        });
        view.addEventListener('viewbeforehide', () => {
            tabs.pause();
            inputManager.off(window, onInputCommand);
        });
        view.addEventListener('viewdestroy', () => {
            tabs.destroy();
        });
    }
}
