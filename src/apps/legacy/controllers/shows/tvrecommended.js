import { getNextUpQuery } from 'lib/queries/nextUp';
import createTabControllerCache from '../tabControllerCache';
import { getLatestMediaQuery } from 'lib/queries/latestMedia';
import ServerConnections from 'lib/jellyfin-apiclient/ServerConnections';
import { queryClient } from 'utils/query/queryClient';
import { userQueryKey } from 'utils/query/queryKeys';
import autoFocuser from 'components/autoFocuser';
import cardBuilder from 'components/cardbuilder/cardBuilder';
import { getBackdropShape } from 'components/cardbuilder/utils/shape';
import layoutManager from 'lib/layoutManager';
import loading from 'components/loading/loading';
import * as mainTabsManager from 'components/maintabsmanager';
import { playbackManager } from 'components/playback/playbackmanager';
import dom from 'utils/dom';
import globalize from 'lib/globalize';
import inputManager from 'scripts/inputManager';
import libraryMenu from 'scripts/libraryMenu';
import * as userSettings from 'scripts/settings/userSettings';
import { LibraryTab } from 'types/libraryTab';
import Dashboard from 'components/dashboard';
import Events from 'utils/events';
import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import { OutboundWebSocketMessageType } from '@jellyfin/sdk/lib/websocket';

import 'components/itemscontainer/emby-itemscontainer';
import 'components/buttons/emby-button';

import 'styles/scrollstyles.scss';

function getTabs() {
    return [{
        name: globalize.translate('Shows')
    }, {
        name: globalize.translate('Suggestions')
    }, {
        name: globalize.translate('TabUpcoming')
    }, {
        name: globalize.translate('Genres')
    }, {
        name: globalize.translate('TabNetworks')
    }, {
        name: globalize.translate('Episodes')
    }];
}

function getDefaultTabIndex(folderId) {
    switch (userSettings.get('landing-' + folderId)) {
        case LibraryTab.Suggestions:
            return 1;

        case LibraryTab.Upcoming:
            return 2;

        case LibraryTab.Genres:
            return 3;

        case LibraryTab.Studios:
            return 4;

        case LibraryTab.Episodes:
            return 5;

        default:
            return 0;
    }
}

function setScrollClasses(elem, scrollX) {
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
}

function initSuggestedTab(page, tabContent) {
    const containers = tabContent.querySelectorAll('.itemsContainer');

    for (let i = 0, length = containers.length; i < length; i++) {
        setScrollClasses(containers[i], enableScrollX());
    }
}

function loadSuggestionsTab(view, params, tabContent) {
    const parentId = params.topParentId;
    const userId = ApiClient.getCurrentUserId();
    console.debug('loadSuggestionsTab');
    loadResume(tabContent, userId, parentId);
    loadLatest(tabContent, userId, parentId);
    loadNextUp(tabContent, userId);
}

function loadResume(view, userId, parentId) {
    const screenWidth = dom.getWindowSize().innerWidth;
    const options = {
        SortBy: 'DatePlayed',
        SortOrder: 'Descending',
        IncludeItemTypes: 'Episode',
        Filters: 'IsResumable',
        Limit: screenWidth >= 1600 ? 5 : 3,
        Recursive: true,
        Fields: 'PrimaryImageAspectRatio,MediaSourceCount',
        CollapseBoxSetItems: false,
        ParentId: parentId,
        ImageTypeLimit: 1,
        EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
        EnableTotalRecordCount: false
    };
    ApiClient.getItems(userId, options).then(function (result) {
        if (result.Items.length) {
            view.querySelector('#resumableSection').classList.remove('hide');
        } else {
            view.querySelector('#resumableSection').classList.add('hide');
        }

        const allowBottomPadding = !enableScrollX();
        const container = view.querySelector('#resumableItems');
        cardBuilder.buildCards(result.Items, {
            itemsContainer: container,
            preferThumb: true,
            inheritThumb: !userSettings.useEpisodeImagesInNextUpAndResume(),
            shape: getBackdropShape(enableScrollX()),
            scalable: true,
            overlayPlayButton: true,
            allowBottomPadding: allowBottomPadding,
            cardLayout: false,
            showTitle: true,
            showYear: true,
            centerText: true
        });
        loading.hide();

        autoFocuser.autoFocus(view);
    });
}

function loadLatest(view, userId, parentId) {
    const options = {
        userId,
        includeItemTypes: ['Episode'],
        limit: 30,
        fields: ['PrimaryImageAspectRatio'],
        parentId,
        imageTypeLimit: 1,
        enableImageTypes: ['Primary', 'Backdrop', 'Thumb']
    };
    const api = ServerConnections.getApi(ApiClient.serverId());
    queryClient.fetchQuery(getLatestMediaQuery(api, options)).then(function (items) {
        const section = view.querySelector('#latestItemsSection');
        const allowBottomPadding = !enableScrollX();
        const container = section.querySelector('#latestEpisodesItems');
        cardBuilder.buildCards(items, {
            parentContainer: section,
            itemsContainer: container,
            items: items,
            shape: 'backdrop',
            preferThumb: true,
            showTitle: true,
            showSeriesYear: true,
            showParentTitle: true,
            overlayText: false,
            cardLayout: false,
            allowBottomPadding: allowBottomPadding,
            showUnplayedIndicator: false,
            showChildCountIndicator: true,
            centerText: true,
            lazy: true,
            overlayPlayButton: true,
            lines: 2
        });
        loading.hide();

        autoFocuser.autoFocus(view);
    });
}

function loadNextUp(view, userId) {
    const query = {
        userId,
        limit: 24,
        fields: ['PrimaryImageAspectRatio', 'DateCreated', 'MediaSourceCount'],
        parentId: libraryMenu.getTopParentId(),
        imageTypeLimit: 1,
        enableImageTypes: ['Primary', 'Backdrop', 'Thumb'],
        enableTotalRecordCount: false
    };
    const api = ServerConnections.getApi(ApiClient.serverId());
    queryClient.fetchQuery(getNextUpQuery(api, query)).then(function (result) {
        if (result.Items.length) {
            view.querySelector('.noNextUpItems').classList.add('hide');
        } else {
            view.querySelector('.noNextUpItems').classList.remove('hide');
        }

        const section = view.querySelector('#nextUpItemsSection');
        const container = section.querySelector('#nextUpItems');
        cardBuilder.buildCards(result.Items, {
            parentContainer: section,
            itemsContainer: container,
            preferThumb: true,
            inheritThumb: !userSettings.useEpisodeImagesInNextUpAndResume(),
            shape: 'backdrop',
            scalable: true,
            showTitle: true,
            showParentTitle: true,
            overlayText: false,
            centerText: true,
            overlayPlayButton: true,
            cardLayout: false
        });
        loading.hide();

        autoFocuser.autoFocus(view);
    });
}

function enableScrollX() {
    return true;
}

export default function (view, params) {
    function onBeforeTabChange(e) {
        tabs.preload(parseInt(e.detail.selectedTabIndex, 10));
    }

    function onTabChange(e) {
        currentTabIndex = parseInt(e.detail.selectedTabIndex, 10);
        tabs.render(currentTabIndex);
    }

    function getTabContainers() {
        return view.querySelectorAll('.pageTabContent');
    }

    function initTabs() {
        mainTabsManager.setTabs(view, currentTabIndex, getTabs, getTabContainers, onBeforeTabChange, onTabChange);
    }

    const tabs = createTabControllerCache(index => {
        const tabContent = view.querySelector(".pageTabContent[data-index='" + index + "']");
        if (index === suggestionsTabIndex) {
            this.tabContent = tabContent;
            return Promise.resolve(this);
        }

        let depends;

        switch (index) {
            case 0:
                depends = 'tvshows';
                break;

            case 2:
                depends = 'tvupcoming';
                break;

            case 3:
                depends = 'tvgenres';
                break;

            case 4:
                depends = 'tvstudios';
                break;

            case 5:
                depends = 'episodes';
                break;
        }

        return import(`../shows/${depends}.js`).then(({ default: ControllerFactory }) => {
            return new ControllerFactory(view, params, tabContent);
        });
    });

    function onPlaybackStop(e, stopInfo) {
        const state = stopInfo.state;

        if (state.NowPlayingItem && state.NowPlayingItem.MediaType == 'Video') {
            const api = ServerConnections.getApi(ApiClient.serverId());
            ['LatestMedia', 'NextUp'].forEach(family => {
                queryClient.invalidateQueries({ queryKey: userQueryKey(api, ApiClient.getCurrentUserId(), family) });
            });
            tabs.reset();
            mainTabsManager.getTabsElement().triggerTabChange();
        }
    }

    function onUserDataChanged({ Data }) {
        if (Data?.UserId == ApiClient.getCurrentUserId()) {
            tabs.reset();
        }
    }

    function onInputCommand(e) {
        if (e.detail.command === 'search') {
            e.preventDefault();
            Dashboard.navigate(`search?collectionType=${CollectionType.Tvshows}&parentId=${params.topParentId}`);
        }
    }

    const self = this;
    let currentTabIndex = parseInt(params.tab || getDefaultTabIndex(params.topParentId), 10);
    const suggestionsTabIndex = 1;

    self.initTab = function () {
        const tabContent = view.querySelector(".pageTabContent[data-index='" + suggestionsTabIndex + "']");
        initSuggestedTab(view, tabContent);
    };

    self.renderTab = function () {
        const tabContent = view.querySelector(".pageTabContent[data-index='" + suggestionsTabIndex + "']");
        loadSuggestionsTab(view, params, tabContent);
    };

    view.addEventListener('viewshow', function () {
        initTabs();
        if (!view.getAttribute('data-title')) {
            const parentId = params.topParentId;

            if (parentId) {
                ApiClient.getItem(ApiClient.getCurrentUserId(), parentId).then(function (item) {
                    view.setAttribute('data-title', item.Name);
                    libraryMenu.setTitle(item.Name);
                });
            } else {
                view.setAttribute('data-title', globalize.translate('Shows'));
                libraryMenu.setTitle(globalize.translate('Shows'));
            }
        }

        Events.on(playbackManager, 'playbackstop', onPlaybackStop);
        self._unsubscribeUserData = ApiClient.subscribe([OutboundWebSocketMessageType.UserDataChanged], onUserDataChanged);
        inputManager.on(window, onInputCommand);
    });
    view.addEventListener('viewbeforehide', function () {
        tabs.pause();
        inputManager.off(window, onInputCommand);
        Events.off(playbackManager, 'playbackstop', onPlaybackStop);
        self._unsubscribeUserData?.();
        self._unsubscribeUserData = null;
    });
    view.addEventListener('viewdestroy', function () {
        tabs.destroy();
    });
}
