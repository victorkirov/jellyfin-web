import { ServerConnections } from 'lib/jellyfin-apiclient';
import { EventType } from 'constants/eventType';

import inputManager from './inputManager';
import viewManager from '../components/viewManager/viewManager';
import { appRouter } from '../components/router/appRouter';
import { playbackManager } from '../components/playback/playbackmanager';
import Dashboard, { pageClassOn } from '../components/dashboard';
import Events, { type Event as JellyfinEvent } from '../utils/events';
import { getParameterByName } from '../utils/url';
import { renderHeaderMarkup, retranslateUi, updateHeaderUserButton, updateClock } from './libraryHeader';
import type { ConnectionClient } from 'lib/jellyfin-apiclient/connectionTypes';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client';
import type { PlaybackStopInfo } from 'types/playbackStopInfo';

import '../elements/emby-button/paper-icon-button-light';

import 'material-design-icons-iconfont';
import '../styles/scrollstyles.scss';
import '../styles/flexstyles.scss';

function renderHeader() {
    renderHeaderMarkup(skinHeader);

    Events.trigger(document, EventType.HEADER_RENDERED);

    headerBackButton = skinHeader.querySelector<HTMLButtonElement>('.headerBackButton')!;
    headerHomeButton = skinHeader.querySelector<HTMLButtonElement>('.headerHomeButton')!;
    headerUserButton = skinHeader.querySelector<HTMLButtonElement>('.headerUserButton')!;
    headerAudioPlayerButton = skinHeader.querySelector<HTMLButtonElement>('.headerAudioPlayerButton')!;
    headerSearchButton = skinHeader.querySelector<HTMLButtonElement>('.headerSearchButton')!;
    currentTimeText = skinHeader.querySelector('.currentTimeText')!;

    retranslateUi(headerBackButton, headerHomeButton, headerAudioPlayerButton, headerSearchButton, headerUserButton);
    lazyLoadViewMenuBarImages();
    bindMenuEvents();
    updateClock(currentTimeText);
}

function getCurrentApiClient() {
    if (currentUser?.localUser) {
        return ServerConnections.getApiClient(currentUser.localUser.ServerId);
    }

    return ServerConnections.currentApiClient();
}

function lazyLoadViewMenuBarImages() {
    void import('../components/images/imageLoader').then((imageLoader) => {
        imageLoader.lazyChildren(skinHeader);
    });
}

function onBackClick() {
    void appRouter.back();
}

function updateUserInHeader(user?: HeaderUser) {
    headerHasLocalUser = !!user?.localUser;
    retranslateUi(headerBackButton, headerHomeButton, headerAudioPlayerButton, headerSearchButton, headerUserButton);

    let hasImage;

    if (user?.name) {
        if (user.imageUrl) {
            const url = user.imageUrl;
            updateHeaderUserButton(headerUserButton, url);
            hasImage = true;
        }
        headerUserButton.classList.remove('hide');
    } else {
        headerUserButton.classList.add('hide');
    }

    if (!hasImage) {
        updateHeaderUserButton(headerUserButton, null);
    }

    if (user?.localUser) {
        if (headerHomeButton) {
            headerHomeButton.classList.remove('hide');
        }
    } else {
        headerHomeButton.classList.add('hide');
    }

    updateSearchButton();
    requiresUserRefresh = false;
}

function updateSearchButton() {
    headerSearchButton?.classList.toggle('hide', !headerHasLocalUser || currentPageIsSearch);
}

function showSearch() {
    inputManager.handleCommand('search');
}

function onHeaderUserButtonClick() {
    void Dashboard.navigate('mypreferencesmenu');
}

function onHeaderHomeButtonClick() {
    void Dashboard.navigate('home');
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
    if (playbackManager.isPlayingAudio()) {
        headerAudioPlayerButton.classList.remove('hide');
    } else {
        headerAudioPlayerButton.classList.add('hide');
    }
}

function onPlaybackStop(_e: JellyfinEvent, stopInfo: PlaybackStopInfo) {
    if (stopInfo.nextMediaType != 'Audio') {
        headerAudioPlayerButton.classList.add('hide');
    }
}

function getTopParentId() {
    return getParameterByName('topParentId') || null;
}

function updateMenuForPageType(isLibraryPage: boolean) {
    const newPageType = isLibraryPage ? 1 : 3;

    if (currentPageType !== newPageType) {
        currentPageType = newPageType;

        document.body.classList.toggle('libraryDocument', isLibraryPage);
    }

    if (requiresUserRefresh) {
        void ServerConnections.user(getCurrentApiClient()!).then(updateUserInHeader);
    }
}

function updateTitle(page: HTMLElement) {
    const title = page.getAttribute('data-title');

    if (title) {
        LibraryMenu.setTitle(title);
    } else if (page.classList.contains('standalonePage')) {
        LibraryMenu.setDefaultTitle();
    }
}

function updateBackButton(page: HTMLElement) {
    if (headerBackButton) {
        if (page.getAttribute('data-backbutton') !== 'false' && appRouter.canGoBack()) {
            headerBackButton.classList.remove('hide');
        } else {
            headerBackButton.classList.add('hide');
        }
    }
}

let headerHomeButton: HTMLButtonElement;
let documentTitle = 'Jellyfin';
let pageTitleElement: HTMLElement | null;
let headerBackButton: HTMLButtonElement;
let headerUserButton: HTMLButtonElement;
type HeaderUser = Partial<Awaited<ReturnType<typeof ServerConnections.user>>>;
let currentUser: HeaderUser | undefined;
let headerHasLocalUser = false;
let currentPageIsSearch = false;
let headerSearchButton: HTMLButtonElement;
let headerAudioPlayerButton: HTMLButtonElement;
let currentTimeText: HTMLElement;
const skinHeader = document.querySelector<HTMLElement>('.skinHeader')!;
let requiresUserRefresh = true;

function setTabs (type: string | null, selectedIndex?: number | null, builder?: () => { name: string; enabled?: boolean; cssClass?: string; href?: string }[]) {
    Events.trigger(document, EventType.SET_TABS, type ? [ type, selectedIndex, builder!()] : []);

    void import('../components/maintabsmanager').then((mainTabsManager) => {
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
const fetchServerName = (_apiClient?: ConnectionClient | null) => {
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
        pageTitleElement.style.backgroundImage = '';
        pageTitleElement.innerHTML = '';
    }

    document.title = documentTitle;
}

function setTitle (title: string | null) {
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
        pageTitleElement.style.backgroundImage = '';
        pageTitleElement.innerText = html || '';
    }

    document.title = title || documentTitle;
}

function setTransparentMenu (transparent: boolean) {
    if (transparent) {
        skinHeader.classList.add('semiTransparent');
    } else {
        skinHeader.classList.remove('semiTransparent');
    }
}

let currentPageType: number | undefined;
pageClassOn('pagebeforeshow', 'page', function (this: HTMLElement) {
    if (!this.classList.contains('withTabs')) {
        LibraryMenu.setTabs(null);
    }
});

pageClassOn('pageshow', 'page', function (this: HTMLElement, e: CustomEvent<{ isRestored?: boolean }>) {
    currentPageIsSearch = this.id === 'searchPage';
    updateSearchButton();
    const isLibraryPage = this.classList.contains('libraryPage');

    updateMenuForPageType(isLibraryPage);

    // TODO: Seems to do nothing? Check if needed (also in other views).
    if (!e.detail.isRestored) {
        window.scrollTo(0, 0);
    }

    updateTitle(this);
    updateBackButton(this);
});

Events.on(ServerConnections, 'apiclientcreated', (_e: JellyfinEvent, newApiClient: ConnectionClient) => {
    fetchServerName(newApiClient);
});

Events.on(ServerConnections, 'localusersignedin', function (_e: JellyfinEvent, user: UserDto) {
    const currentApiClient = ServerConnections.getApiClient(user.ServerId);

    currentUser = {
        localUser: user
    };

    void ServerConnections.user(currentApiClient!).then(function (userResult) {
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

(window as Window & { LibraryMenu?: typeof LibraryMenu }).LibraryMenu = LibraryMenu;
renderHeader();

export default LibraryMenu;
