import loading from 'components/loading/loading';
import { appRouter } from 'components/router/appRouter';
import layoutManager from 'lib/layoutManager';
import libraryMenu from 'scripts/libraryMenu';
import appSettings from 'scripts/settings/appSettings';
import focusManager from 'lib/focusManager';
import globalize from 'lib/globalize';
import actionSheet from 'components/actionSheet/actionSheet';
import confirm from 'components/confirm/confirm';
import dom from 'utils/dom';
import 'material-design-icons-iconfont';
import 'styles/flexstyles.scss';
import 'elements/emby-scroller/emby-scroller';
import 'components/itemscontainer/emby-itemscontainer';
import 'components/cardbuilder/card.scss';
import 'components/buttons/emby-button';
import Dashboard from 'components/dashboard';
import alert from 'components/alert';
import { ConnectionState, ServerConnections } from 'lib/jellyfin-apiclient';
import type { ServerInfo } from 'lib/jellyfin-apiclient/connectionTypes';
import { getServerCardsHtml } from 'components/connection/serverCards';

function updatePageStyle(view: HTMLElement, params: { showuser?: string }) {
    if (params.showuser == '1') {
        view.classList.add('libraryPage');
        view.classList.remove('standalonePage');
        view.classList.add('noSecondaryNavPage');
    } else {
        view.classList.add('standalonePage');
        view.classList.remove('libraryPage');
        view.classList.remove('noSecondaryNavPage');
    }
}

function alertText(text: string) {
    alertTextWithOptions({
        text: text
    });
}

function alertTextWithOptions(options: { text: string; html?: string }) {
    void alert(options);
}

function showServerConnectionFailure() {
    alertText(globalize.translate('MessageUnableToConnectToServer'));
}

export default function (view: HTMLElement, params: { showuser?: string }) {
    function connectToServer(server: ServerInfo) {
        loading.show();
        void ServerConnections.connectToServer(server, {
            enableAutoLogin: appSettings.enableAutoLogin()
        }).then(function (result) {
            loading.hide();

            switch (result.State) {
                case ConnectionState.SignedIn: {
                    const apiClient = result.ApiClient;
                    Dashboard.onServerChanged(apiClient.getCurrentUserId(), apiClient.accessToken(), apiClient);
                    void Dashboard.navigate('home');
                    break;
                }

                case ConnectionState.ServerSignIn: {
                    const apiClient = result.ApiClient;
                    Dashboard.onServerChanged(null, null, apiClient);
                    void Dashboard.navigate('login?serverid=' + result.Servers[0].Id);
                    break;
                }

                case ConnectionState.ServerUpdateNeeded:
                    alertTextWithOptions({
                        text: globalize.translate('core#ServerUpdateNeeded', 'https://github.com/jellyfin/jellyfin'),
                        html: globalize.translate('core#ServerUpdateNeeded', '<a href="https://github.com/jellyfin/jellyfin">https://github.com/jellyfin/jellyfin</a>')
                    });
                    break;

                default:
                    showServerConnectionFailure();
            }
        });
    }

    function deleteServer(server: ServerInfo) {
        void confirm({
            title: globalize.translate('DeleteName', server.Name!),
            text: globalize.translate('DeleteServerConfirmation'),
            confirmText: globalize.translate('Delete'),
            primary: 'delete'
        }).then(function () {
            loading.show();
            void ServerConnections.deleteServer(server.Id!).then(function () {
                loading.hide();
                loadServers();
            }).catch(err => {
                console.error('[selectServer] failed to delete server', err);
            });
        }).catch(() => {
            // confirm dialog closed
        });
    }

    function onServerClick(server: ServerInfo) {
        const menuItems = [];
        menuItems.push({
            name: globalize.translate('Connect'),
            id: 'connect'
        });
        menuItems.push({
            name: globalize.translate('Delete'),
            id: 'delete'
        });
        void actionSheet.show({
            items: menuItems,
            title: server.Name ?? undefined
        }).then(function (id) {
            switch (id) {
                case 'connect':
                    connectToServer(server);
                    break;

                case 'delete':
                    deleteServer(server);
                    break;
            }
        }).catch(() => { /* no-op */ });
    }

    function onServersRetrieved(result: ServerInfo[]) {
        servers = result;
        view.querySelector<HTMLElement>('.servers')!.innerHTML = getServerCardsHtml(result);
        loading.hide();

        if (layoutManager.tv) {
            focusManager.autoFocus(view);
        }
    }

    function loadServers() {
        loading.show();
        void ServerConnections.getAvailableServers().then(onServersRetrieved);
    }

    let servers: ServerInfo[];
    updatePageStyle(view, params);
    view.addEventListener('viewshow', function (e) {
        const isRestored = (e as CustomEvent<{ isRestored: boolean }>).detail.isRestored;
        libraryMenu.setTitle(null);
        libraryMenu.setTransparentMenu(true);

        if (!isRestored) {
            loadServers();
        }
    });
    view.querySelector<HTMLElement>('.servers')!.addEventListener('click', function (e) {
        const card = dom.parentWithClass(e.target as HTMLElement, 'card') as HTMLElement | null;

        if (card) {
            const url = card.getAttribute('data-url');

            if (url) {
                void appRouter.show(url);
            } else {
                const id = card.getAttribute('data-id');
                onServerClick(servers.filter(function (s) {
                    return s.Id === id;
                })[0]);
            }
        }
    });
}
