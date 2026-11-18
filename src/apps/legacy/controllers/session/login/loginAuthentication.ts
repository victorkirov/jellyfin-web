import type { DialogElement } from 'components/dialogHelper/dialogTypes';
import type { ApiClient } from 'jellyfin-apiclient';
import loading from 'components/loading/loading';
import Dashboard from 'components/dashboard';
import toast from 'components/toast/toast';
import globalize from 'lib/globalize';
import dialogHelper from 'components/dialogHelper/dialogHelper';
import baseAlert from 'components/alert';

export function authenticateUserByName(page: HTMLElement, apiClient: ApiClient, url: string, username: string, password: string) {
    loading.show();
    apiClient.authenticateUserByName(username, password).then(function (result) {
        const user = result.User!;
        loading.hide();

        onLoginSuccessful(user.Id, result.AccessToken, apiClient, url);
    }, function (response) {
        page.querySelector<HTMLInputElement>('#txtManualPassword')!.value = '';
        loading.hide();

        const UnauthorizedOrForbidden = [401, 403];
        if (UnauthorizedOrForbidden.includes(response.status)) {
            const messageKey = response.status === 401 ? 'MessageInvalidUser' : 'MessageUnauthorizedUser';
            toast(globalize.translate(messageKey));
        } else {
            Dashboard.alert({
                message: globalize.translate('MessageUnableToConnectToServer'),
                title: globalize.translate('HeaderConnectionFailure')
            });
        }
    });
}

export function authenticateQuickConnect(apiClient: ApiClient, targetUrl: string) {
    const url = apiClient.getUrl('/QuickConnect/Initiate');
    // The legacy declaration omits ajax's optional authorization argument.
    (apiClient.ajax as (request: { type: string; url: string }, includeAuthorization: boolean) => Promise<Response>)({ type: 'POST', url }, true).then(res => res.json()).then(function (json) {
        if (!json.Secret || !json.Code) {
            console.error('Malformed quick connect response', json);
            return false;
        }

        void baseAlert({
            dialogOptions: {
                id: 'quickConnectAlert'
            },
            title: globalize.translate('QuickConnect'),
            text: globalize.translate('QuickConnectAuthorizeCode', json.Code)
        });

        const connectUrl = apiClient.getUrl('/QuickConnect/Connect?Secret=' + json.Secret);

        const interval = setInterval(function() {
            apiClient.getJSON(connectUrl).then(async function(data) {
                if (!data.Authenticated) {
                    return;
                }

                clearInterval(interval);

                // Close the QuickConnect dialog
                const dlg = document.querySelector<DialogElement>('#quickConnectAlert');
                if (dlg) {
                    dialogHelper.close(dlg);
                }

                const result = await apiClient.quickConnect(data.Secret);
                onLoginSuccessful(result.User!.Id, result.AccessToken, apiClient, targetUrl);
            }, function (e) {
                clearInterval(interval);

                // Close the QuickConnect dialog
                const dlg = document.querySelector<DialogElement>('#quickConnectAlert');
                if (dlg) {
                    dialogHelper.close(dlg);
                }

                Dashboard.alert({
                    message: globalize.translate('QuickConnectDeactivated'),
                    title: globalize.translate('HeaderError')
                });

                console.error('Unable to login with quick connect', e);
            });
        }, 5000, connectUrl);

        return true;
    }, function(e) {
        Dashboard.alert({
            message: globalize.translate('QuickConnectNotActive'),
            title: globalize.translate('HeaderError')
        });

        console.error('Quick connect error: ', e);
        return false;
    });
}

function onLoginSuccessful(id: string | null | undefined, accessToken: string | null | undefined, apiClient: ApiClient, url: string) {
    Dashboard.onServerChanged(id, accessToken, apiClient);
    void Dashboard.navigate(url || 'home');
}
