import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { EventType } from 'constants/eventType';

import layoutManager from '../components/layoutManager';
import inputManager from './inputManager';
import viewManager from '../components/viewManager/viewManager';
import { appRouter } from '../components/router/appRouter';
import { playbackManager } from '../components/playback/playbackmanager';
import browser from './browser';
import Dashboard, { pageClassOn } from '../utils/dashboard';
import Events from '../utils/events.ts';
import { getParameterByName } from '../utils/url.ts';
import datetime from '../scripts/datetime';

import '../elements/emby-button/paper-icon-button-light';

import 'material-design-icons-iconfont';
import '../styles/scrollstyles.scss';
import '../styles/flexstyles.scss';

function renderHeader() {
    let html = '';
    html += '<div class="flex align-items-center flex-grow headerTop">';
    html += '<div class="headerLeft">';
    html += '<button type="button" is="paper-icon-button-light" class="headerButton headerButtonLeft headerBackButton hide"><span class="material-icons ' + (browser.safari ? 'chevron_left' : 'arrow_back') + '" aria-hidden="true"></span></button>';
    html += '<button type="button" is="paper-icon-button-light" class="headerButton headerHomeButton hide barsMenuButton headerButtonLeft"><span class="material-icons home" aria-hidden="true"></span></button>';
    html += '<h3 class="pageTitle" aria-hidden="true"></h3>';
    html += '</div>';
    html += '<div class="headerRight">';
    html += '<button is="paper-icon-button-light" class="headerAudioPlayerButton audioPlayerButton headerButton headerButtonRight hide"><span class="material-icons music_note" aria-hidden="true"></span></button>';
    html += '<button type="button" is="paper-icon-button-light" class="headerButton headerButtonRight headerSearchButton hide"><span class="material-icons search" aria-hidden="true"></span></button>';
    html += '<button is="paper-icon-button-light" class="headerButton headerButtonRight headerUserButton hide"><span class="material-icons person" aria-hidden="true"></span></button>';
    html += '<div class="currentTimeText hide"></div>';
    html += '</div>';
    html += '</div>';
    html += '<div class="headerTabs sectionTabs hide">';
    html += '</div>';

    skinHeader.classList.add('skinHeader-withBackground');
    skinHeader.classList.add('skinHeader-blurred');
    skinHeader.innerHTML = html;

    Events.trigger(document, EventType.HEADER_RENDERED);

    headerBackButton = skinHeader.querySelector('.headerBackButton');
    headerHomeButton = skinHeader.querySelector('.headerHomeButton');
    headerUserButton = skinHeader.querySelector('.headerUserButton');
    headerAudioPlayerButton = skinHeader.querySelector('.headerAudioPlayerButton');
    headerSearchButton = skinHeader.querySelector('.headerSearchButton');
    currentTimeText = skinHeader.querySelector('.currentTimeText');

    retranslateUi();
    lazyLoadViewMenuBarImages();
    bindMenuEvents();
    updateClock();
}

function getCurrentApiClient() {
    if (currentUser?.localUser) {
        return ServerConnections.getApiClient(currentUser.localUser.ServerId);
    }

    return ServerConnections.currentApiClient();
}

function lazyLoadViewMenuBarImages() {
    import('../components/images/imageLoader').then((imageLoader) => {
        imageLoader.lazyChildren(skinHeader);
    });
}

function onBackClick() {
    appRouter.back();
}

function retranslateUi() {
    if (headerBackButton) {
        headerBackButton.title = globalize.translate('ButtonBack');
    }

    if (headerHomeButton) {
        headerHomeButton.title = globalize.translate('Home');
    }

    if (headerAudioPlayerButton) {
        headerAudioPlayerButton.title = globalize.translate('ButtonPlayer');
    }

    if (headerSearchButton) {
        headerSearchButton.title = globalize.translate('Search');
    }

    if (headerUserButton) {
        headerUserButton.title = globalize.translate('Settings');
    }
}

function updateUserInHeader(user) {
    retranslateUi();

    let hasImage;

    if (user?.name) {
        if (user.imageUrl) {
            const url = user.imageUrl;
            updateHeaderUserButton(url);
            hasImage = true;
        }
        headerUserButton.title = user.name;
        headerUserButton.classList.remove('hide');
    } else {
        headerUserButton.classList.add('hide');
    }

    if (!hasImage) {
        updateHeaderUserButton(null);
    }

    if (user?.localUser) {
        if (headerHomeButton) {
            headerHomeButton.classList.remove('hide');
        }

        if (headerSearchButton) {
            headerSearchButton.classList.remove('hide');
        }
    } else {
        headerHomeButton.classList.add('hide');

        if (headerSearchButton) {
            headerSearchButton.classList.add('hide');
        }
    }

    requiresUserRefresh = false;
}

function updateHeaderUserButton(src) {
    if (src) {
        headerUserButton.classList.add('headerUserButtonRound');
        headerUserButton.innerHTML = '<div class="headerButton headerButtonRight paper-icon-button-light headerUserButtonRound" style="background-image:url(\'' + src + "');\"></div>";
    } else {
        headerUserButton.classList.remove('headerUserButtonRound');
        headerUserButton.innerHTML = '<span class="material-icons person" aria-hidden="true"></span>';
    }
}

function updateClock() {
    if (layoutManager.tv) {
        currentTimeText.classList.remove('hide');
        let lastMinute;
        setInterval(function() {
            const now = new Date();
            // Formatting the time is slow on low-end TVs, so only update it when the minute changes
            if (now.getMinutes() !== lastMinute) {
                lastMinute = now.getMinutes();
                currentTimeText.innerText = datetime.getDisplayTime(now);
            }
        }, 1000);
    } else {
        currentTimeText.classList.add('hide');
    }
}

function showSearch() {
    inputManager.handleCommand('search');
}

function onHeaderUserButtonClick() {
    Dashboard.navigate('mypreferencesmenu');
}

function onHeaderHomeButtonClick() {
    Dashboard.navigate('home');
}

function showAudioPlayer() {
    return appRouter.showNowPlaying();
}

function bindMenuEvents() {
    if (headerBackButton) {
        headerBackButton.addEventListener('click', onBackClick);
    }

    if (headerSearchButton) {
        headerSearchButton.addEventListener('click', showSearch);
    }

    headerUserButton.addEventListener('click', onHeaderUserButtonClick);
    headerHomeButton.addEventListener('click', onHeaderHomeButtonClick);

    headerAudioPlayerButton.addEventListener('click', showAudioPlayer);

    Events.on(playbackManager, 'playbackstart', onPlaybackStart);
    Events.on(playbackManager, 'playbackstop', onPlaybackStop);
}

function onPlaybackStart() {
    if (playbackManager.isPlayingAudio() && layoutManager.tv) {
        headerAudioPlayerButton.classList.remove('hide');
    } else {
        headerAudioPlayerButton.classList.add('hide');
    }
}

function onPlaybackStop(e, stopInfo) {
    if (stopInfo.nextMediaType != 'Audio') {
        headerAudioPlayerButton.classList.add('hide');
    }
}

function getTopParentId() {
    return getParameterByName('topParentId') || null;
}

function updateMenuForPageType(isDashboardPage, isLibraryPage) {
    let newPageType = 3;
    if (isDashboardPage) {
        newPageType = 2;
    } else if (isLibraryPage) {
        newPageType = 1;
    }

    if (currentPageType !== newPageType) {
        currentPageType = newPageType;

        document.body.classList.toggle('libraryDocument', isLibraryPage);
    }

    if (requiresUserRefresh) {
        ServerConnections.user(getCurrentApiClient()).then(updateUserInHeader);
    }
}

function updateTitle(page) {
    const title = page.getAttribute('data-title');

    if (title) {
        LibraryMenu.setTitle(title);
    } else if (page.classList.contains('standalonePage')) {
        LibraryMenu.setDefaultTitle();
    }
}

function updateBackButton(page) {
    if (headerBackButton) {
        if (page.getAttribute('data-backbutton') !== 'false' && appRouter.canGoBack()) {
            headerBackButton.classList.remove('hide');
        } else {
            headerBackButton.classList.add('hide');
        }
    }
}

let headerHomeButton;
let documentTitle = 'Jellyfin';
let pageTitleElement;
let headerBackButton;
let headerUserButton;
let currentUser;
let headerSearchButton;
let headerAudioPlayerButton;
let currentTimeText;
const skinHeader = document.querySelector('.skinHeader');
let requiresUserRefresh = true;

function setTabs (type, selectedIndex, builder) {
    Events.trigger(document, EventType.SET_TABS, type ? [ type, selectedIndex, builder()] : []);

    import('../components/maintabsmanager').then((mainTabsManager) => {
        if (type) {
            mainTabsManager.setTabs(viewManager.currentView(), selectedIndex, builder, function () {
                return [];
            });
        } else {
            mainTabsManager.setTabs(null);
        }
    });
}

/**
 * Fetch the server name and update the document title.
 * @param {import('jellyfin-apiclient').ApiClient} [_apiClient] The current api client.
 */
const fetchServerName = (_apiClient) => {
    _apiClient
        ?.getPublicSystemInfo()
        .then(({ ServerName }) => {
            documentTitle = ServerName || documentTitle;
            document.title = documentTitle;
        })
        .catch(err => {
            console.error('[LibraryMenu] failed to fetch system info', err);
        });
};

function setDefaultTitle () {
    if (!pageTitleElement) {
        pageTitleElement = document.querySelector('.pageTitle');
    }

    if (pageTitleElement) {
        pageTitleElement.classList.add('pageTitleWithLogo');
        pageTitleElement.classList.add('pageTitleWithDefaultLogo');
        pageTitleElement.style.backgroundImage = null;
        pageTitleElement.innerHTML = '';
    }

    document.title = documentTitle;
}

function setTitle (title) {
    if (title == null) {
        LibraryMenu.setDefaultTitle();
        return;
    }

    if (title === '-') {
        title = '';
    }

    const html = title;

    if (!pageTitleElement) {
        pageTitleElement = document.querySelector('.pageTitle');
    }

    if (pageTitleElement) {
        pageTitleElement.classList.remove('pageTitleWithLogo');
        pageTitleElement.classList.remove('pageTitleWithDefaultLogo');
        pageTitleElement.style.backgroundImage = null;
        pageTitleElement.innerText = html || '';
    }

    document.title = title || documentTitle;
}

function setTransparentMenu (transparent) {
    if (transparent) {
        skinHeader.classList.add('semiTransparent');
    } else {
        skinHeader.classList.remove('semiTransparent');
    }
}

let currentPageType;
pageClassOn('pagebeforeshow', 'page', function () {
    if (!this.classList.contains('withTabs')) {
        LibraryMenu.setTabs(null);
    }
});

pageClassOn('pageshow', 'page', function (e) {
    const page = this;
    const isDashboardPage = page.classList.contains('type-interior');
    const isLibraryPage = !isDashboardPage && page.classList.contains('libraryPage');

    updateMenuForPageType(isDashboardPage, isLibraryPage);

    // TODO: Seems to do nothing? Check if needed (also in other views).
    if (!e.detail.isRestored) {
        window.scrollTo(0, 0);
    }

    updateTitle(page);
    updateBackButton(page);
});

Events.on(ServerConnections, 'apiclientcreated', (e, newApiClient) => {
    fetchServerName(newApiClient);
});

Events.on(ServerConnections, 'localusersignedin', function (e, user) {
    const currentApiClient = ServerConnections.getApiClient(user.ServerId);

    currentUser = {
        localUser: user
    };

    ServerConnections.user(currentApiClient).then(function (userResult) {
        currentUser = userResult;
        updateUserInHeader(userResult);
    });
});

Events.on(ServerConnections, 'localusersignedout', function () {
    currentUser = {};
    updateUserInHeader();
});

fetchServerName(getCurrentApiClient());

const LibraryMenu = {
    getTopParentId,
    setTabs,
    setDefaultTitle,
    setTitle,
    setTransparentMenu
};

window.LibraryMenu = LibraryMenu;
renderHeader();

export default LibraryMenu;
