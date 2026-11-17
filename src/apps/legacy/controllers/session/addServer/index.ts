import loading from 'components/loading/loading';
import globalize from 'lib/globalize';
import { ConnectionState, ServerConnections } from 'lib/jellyfin-apiclient';
import type { ConnectResult } from 'lib/jellyfin-apiclient/connectionTypes';
import appSettings from 'scripts/settings/appSettings';
import Dashboard from 'components/dashboard';

import 'components/buttons/emby-button';

function handleConnectionResult(result: ConnectResult) {
    if (result.State === ConnectionState.Superseded) return;
    loading.hide();
    switch (result.State) {
        case ConnectionState.SignedIn: {
            const apiClient = result.ApiClient;
            Dashboard.onServerChanged(apiClient.getCurrentUserId(), apiClient.accessToken(), apiClient);
            void Dashboard.navigate('home');
            break;
        }
        case ConnectionState.ServerSignIn:
            void Dashboard.navigate('login?serverid=' + result.Servers[0].Id, false);
            break;
        case ConnectionState.ServerSelection:
            void Dashboard.navigate('selectserver', false);
            break;
        case ConnectionState.ServerUpdateNeeded:
            Dashboard.alert({
                message: globalize.translate('ServerUpdateNeeded', '<a href="https://github.com/jellyfin/jellyfin">https://github.com/jellyfin/jellyfin</a>')
            });
            break;
        case ConnectionState.Unavailable:
            Dashboard.alert({
                message: globalize.translate('MessageUnableToConnectToServer'),
                title: globalize.translate('HeaderConnectionFailure')
            });
    }
}

function submitServer(page: HTMLElement) {
    loading.show();
    // eslint-disable-next-line sonarjs/slow-regex
    const host = page.querySelector<HTMLInputElement>('#txtServerHost')!.value.replace(/\/+$/, '');
    void ServerConnections.connectToAddress(host, {
        enableAutoLogin: appSettings.enableAutoLogin()
    }).then(handleConnectionResult, function() {
        handleConnectionResult({
            State: ConnectionState.Unavailable
        });
    });
}

export default function(view: HTMLElement) {
    view.querySelector<HTMLFormElement>('.addServerForm')!.addEventListener('submit', onServerSubmit);
    view.querySelector<HTMLButtonElement>('.btnCancel')!.addEventListener('click', goBack);

    void import('components/autoFocuser').then(({ default: autoFocuser }) => {
        autoFocuser.autoFocus(view);
    });

    function onServerSubmit(e: Event) {
        submitServer(view);
        e.preventDefault();
        return false;
    }

    function goBack() {
        void import('components/router/appRouter').then(({ appRouter }) => {
            void appRouter.back();
        });
    }
}
