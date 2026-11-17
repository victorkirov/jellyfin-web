import cardBuilder from 'components/cardbuilder/cardBuilder';
import { getBackdropShape, getPortraitShape } from 'components/cardbuilder/utils/shape';
import { clearLiveTvStatus, showLiveTvStatus } from 'components/guide/liveTvStatus';
import imageLoader from 'components/images/imageLoader';
import layoutManager from 'lib/layoutManager';
import loading from 'components/loading/loading';
import * as mainTabsManager from 'components/maintabsmanager';
import globalize from 'lib/globalize';
import inputManager from 'scripts/inputManager';
import * as userSettings from 'scripts/settings/userSettings';
import { LibraryTab } from 'types/libraryTab';
import Dashboard from 'components/dashboard';

import 'components/itemscontainer/emby-itemscontainer';
import 'elements/emby-tabs/emby-tabs';
import 'components/buttons/emby-button';

import 'styles/scrollstyles.scss';

function enableScrollX() {
    return true;
}

function getLimit() {
    if (enableScrollX()) {
        return 12;
    }

    return 9;
}

function reload(page, enableFullRender) {
    if (!enableFullRender) {
        return;
    }

    loading.show();
    clearLiveTvStatus(page);
    const sections = [
        { className: 'activeProgramItems', query: { IsAiring: true, limit: getLimit() * (enableScrollX() ? 2 : 1) }, recommended: true, overlay: 'play', options: { showAirDateTime: false, showAirEndTime: true } },
        { className: 'upcomingEpisodeItems', query: { IsMovie: false, IsSports: false, IsKids: false, IsNews: false, IsSeries: true } },
        { className: 'upcomingTvMovieItems', query: { IsMovie: true, Fields: 'ChannelInfo' }, options: { shape: getPortraitShape(enableScrollX()), preferThumb: null, showParentTitle: false } },
        { className: 'upcomingSportsItems', query: { IsSports: true } },
        { className: 'upcomingKidsItems', query: { IsKids: true } },
        { className: 'upcomingNewsItems', query: { IsNews: true }, options: { showParentTitleOrTitle: true, showTitle: false, showParentTitle: false } }
    ];
    let failed = false;
    let hasPrograms = false;

    return Promise.all(sections.map(function (section) {
        const query = Object.assign({
            userId: Dashboard.getCurrentUserId(),
            HasAired: false,
            limit: getLimit(),
            EnableTotalRecordCount: false,
            Fields: 'ChannelInfo,PrimaryImageAspectRatio',
            EnableImageTypes: section.recommended ? 'Primary,Thumb,Backdrop' : 'Primary,Thumb'
        }, section.query);
        if (section.recommended) {
            delete query.HasAired;
            query.ImageTypeLimit = 1;
        }
        const request = section.recommended ? ApiClient.getLiveTvRecommendedPrograms(query) : ApiClient.getLiveTvPrograms(query);
        return request.then(function (result) {
            hasPrograms = hasPrograms || result.Items.length > 0;
            renderItems(page, result.Items, section.className, section.overlay, section.options);
        }, function () {
            failed = true;
            renderItems(page, [], section.className);
        });
    })).then(function () {
        loading.hide();
        if (failed || !hasPrograms) {
            let message = 'LiveTvNoPrograms';
            if (failed) {
                message = hasPrograms ? 'LiveTvPartialLoadError' : 'LiveTvLoadError';
            }
            showLiveTvStatus(page, message, failed ? () => reload(page, true) : null, true);
        }
        import('components/autoFocuser').then(({ default: autoFocuser }) => {
            autoFocuser.autoFocus(page);
        });
    });
}

function renderItems(page, items, sectionClass, overlayButton, cardOptions) {
    const html = cardBuilder.getCardsHtml(Object.assign({
        items: items,
        preferThumb: 'auto',
        inheritThumb: false,
        shape: enableScrollX() ? 'autooverflow' : 'auto',
        defaultShape: getBackdropShape(enableScrollX()),
        showParentTitle: true,
        showTitle: true,
        centerText: true,
        coverImage: true,
        overlayText: false,
        lazy: true,
        overlayPlayButton: overlayButton === 'play',
        overlayMoreButton: overlayButton === 'more',
        overlayInfoButton: overlayButton === 'info',
        allowBottomPadding: !enableScrollX(),
        showAirTime: true,
        showAirDateTime: true
    }, cardOptions || {}));
    const elem = page.querySelector('.' + sectionClass);
    elem.innerHTML = html;
    elem.closest('.verticalSection').classList.toggle('hide', !items.length);
    imageLoader.lazyChildren(elem);
}

function getTabs() {
    return [{
        name: globalize.translate('Programs')
    }, {
        name: globalize.translate('Guide')
    }, {
        name: globalize.translate('Channels')
    }, {
        name: globalize.translate('Recordings')
    }];
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

function getDefaultTabIndex(folderId) {
    switch (userSettings.get('landing-' + folderId)) {
        case LibraryTab.Guide:
            return 1;
        case LibraryTab.Channels:
            return 2;
        case LibraryTab.Recordings:
            return 3;
        default:
            return 0;
    }
}

export default function (view, params) {
    function enableFullRender() {
        return new Date().getTime() - lastFullRender > 3e5;
    }

    function onBeforeTabChange(evt) {
        preLoadTab(view, parseInt(evt.detail.selectedTabIndex, 10));
    }

    function onTabChange(evt) {
        const previousTabController = tabControllers[parseInt(evt.detail.previousIndex, 10)];

        if (previousTabController?.onHide) {
            previousTabController.onHide();
        }

        loadTab(view, parseInt(evt.detail.selectedTabIndex, 10));
    }

    function getTabContainers() {
        return view.querySelectorAll('.pageTabContent');
    }

    function initTabs() {
        mainTabsManager.setTabs(view, currentTabIndex, getTabs, getTabContainers, onBeforeTabChange, onTabChange);
    }

    function getTabController(page, index, callback) {
        let depends;

        // TODO int is a little hard to read
        switch (index) {
            case 0:
                depends = 'livetvsuggested';
                break;

            case 1:
                depends = 'livetvguide';
                break;

            case 2:
                depends = 'livetvchannels';
                break;

            case 3:
                depends = 'livetvrecordings';
                break;
        }

        import(`../livetv/${depends}`).then(({ default: ControllerFactory }) => {
            let tabContent;

            if (index === 0) {
                tabContent = view.querySelector(`.pageTabContent[data-index="${index}"]`);
                self.tabContent = tabContent;
            }

            let controller = tabControllers[index];

            if (!controller) {
                tabContent = view.querySelector(`.pageTabContent[data-index="${index}"]`);

                if (index === 0) {
                    controller = self;
                } else {
                    controller = new ControllerFactory(view, params, tabContent);
                }

                tabControllers[index] = controller;

                if (controller.initTab) {
                    controller.initTab();
                }
            }

            callback(controller);
        });
    }

    function preLoadTab(page, index) {
        getTabController(page, index, function (controller) {
            if (renderedTabs.indexOf(index) === -1 && controller.preRender) {
                controller.preRender();
            }
        });
    }

    function loadTab(page, index) {
        currentTabIndex = index;
        getTabController(page, index, function (controller) {
            initialTabIndex = null;

            if (renderedTabs.indexOf(index) === -1) {
                if (index === 1) {
                    renderedTabs.push(index);
                }

                controller.renderTab();
            } else if (controller.onShow) {
                controller.onShow();
            }

            currentTabController = controller;
        });
    }

    function onInputCommand(evt) {
        if (evt.detail.command === 'search') {
            evt.preventDefault();
            Dashboard.navigate('search?collectionType=livetv');
        }
    }

    let isViewRestored;
    const self = this;
    let currentTabIndex = parseInt(params.tab || getDefaultTabIndex('livetv'), 10);
    if (!(currentTabIndex >= 0 && currentTabIndex < getTabs().length)) {
        currentTabIndex = 0;
    }
    let initialTabIndex = currentTabIndex;
    let lastFullRender = 0;
    [].forEach.call(view.querySelectorAll('.sectionTitleTextButton-programs'), function (link) {
        const href = link.getAttribute('href');

        if (href) {
            link.href = href + '&serverId=' + ApiClient.serverId();
        }
    });

    self.initTab = function () {
        const tabContent = view.querySelector('.pageTabContent[data-index="0"]');
        const containers = tabContent.querySelectorAll('.itemsContainer');

        for (let i = 0, length = containers.length; i < length; i++) {
            setScrollClasses(containers[i], enableScrollX());
        }
    };

    self.renderTab = function () {
        const tabContent = view.querySelector('.pageTabContent[data-index="0"]');

        if (enableFullRender()) {
            reload(tabContent, true);
            lastFullRender = new Date().getTime();
        } else {
            reload(tabContent);
        }
    };

    let currentTabController;
    const tabControllers = [];
    const renderedTabs = [];
    view.addEventListener('viewbeforeshow', function (evt) {
        isViewRestored = evt.detail.isRestored;
        initTabs();
    });
    view.addEventListener('viewshow', function (evt) {
        isViewRestored = evt.detail.isRestored;

        if (!isViewRestored) {
            mainTabsManager.selectedTabIndex(initialTabIndex);
        }

        inputManager.on(window, onInputCommand);
    });
    view.addEventListener('viewbeforehide', function () {
        if (currentTabController?.onHide) {
            currentTabController.onHide();
        }

        inputManager.off(window, onInputCommand);
    });
    view.addEventListener('viewdestroy', function () {
        tabControllers.forEach(function (tabController) {
            if (tabController.destroy) {
                tabController.destroy();
            }
        });
    });
}
