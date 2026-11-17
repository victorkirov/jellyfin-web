import { appHost } from 'components/apphost';
import viewContainer from 'components/viewContainer';
import { AppFeature } from 'constants/appFeature';
import { ServerConnections } from 'lib/jellyfin-apiclient/index';

import toast from './toast/toast';
import loading from './loading/loading';
import { appRouter } from './router/appRouter';
import baseAlert from './alert';
import baseConfirm from './confirm/confirm';
import globalize from '../lib/globalize/index';
import * as webSettings from '../scripts/settings/webSettings';
import datetime from '../scripts/datetime';
import { setBackdropTransparency } from './backdrop/backdrop';
import dialogHelper from './dialogHelper/dialogHelper';
import { getLocationSearch } from '../utils/url.ts';
import { queryClient } from '../utils/query/queryClient';

export function getCurrentUser() {
    return window.ApiClient.getCurrentUser(false);
}

// TODO: investigate url prefix support for serverAddress function
export async function serverAddress() {
    const apiClient = window.ApiClient;

    if (apiClient) {
        return Promise.resolve(apiClient.serverAddress());
    }

    // Use servers specified in config.json
    const urls = await webSettings.getServers();

    if (urls.length === 0) {
        // Otherwise use computed base URL
        let url;
        const index = window.location.href.toLowerCase().lastIndexOf('/web');
        if (index != -1) {
            url = window.location.href.substring(0, index);
        } else {
            // fallback to location without path
            url = window.location.origin;
        }

        // Don't use bundled app URL (file:) as server URL
        if (url.startsWith('file:')) {
            return Promise.resolve();
        }

        urls.push(url);
    }

    console.debug('URL candidates:', urls);

    const promises = urls.map(url => {
        return fetch(`${url}/System/Info/Public`, { cache: 'no-cache' })
            .then(async resp => {
                if (!resp.ok) {
                    return;
                }

                let config;
                try {
                    config = await resp.json();
                } catch {
                    return;
                }

                return {
                    url,
                    config
                };
            }).catch(error => {
                console.error(error);
            });
    });

    return Promise.all(promises).then(responses => {
        return responses.filter(obj => obj?.config);
    }).then(configs => {
        const selection = configs.find(obj => !obj.config.StartupWizardCompleted) || configs[0];
        return selection?.url;
    }).catch(error => {
        console.error(error);
    });
}

export function getCurrentUserId() {
    const apiClient = window.ApiClient;

    if (apiClient) {
        return apiClient.getCurrentUserId();
    }

    return null;
}

export function onServerChanged(_userId, _accessToken, apiClient) {
    ServerConnections.setLocalApiClient(apiClient);
}

export function logout() {
    ServerConnections.logout().then(function () {
        // Clear the query cache
        queryClient.clear();
        // Reset cached views
        viewContainer.reset();

        if (appHost.supports(AppFeature.MultiServer)) {
            selectServer();
        } else {
            navigate('login');
        }
    });
}

/**
 * Navigate to a url.
 * @param {string} url - The url to navigate to.
 * @param {boolean} [preserveQueryString] - A flag to indicate the current query string should be appended to the new url.
 * @returns {Promise<any>}
 */
export function navigate(url, preserveQueryString) {
    if (!url) {
        throw new Error('url cannot be null or empty');
    }

    const queryString = getLocationSearch();

    if (preserveQueryString && queryString) {
        url += queryString;
    }

    return appRouter.show(url);
}

export function processErrorResponse(response) {
    loading.hide();

    let status = '' + response.status;

    if (response.statusText) {
        status = response.statusText;
    }

    baseAlert({
        title: status,
        text: response.headers ? response.headers.get('X-Application-Error-Code') : null
    });
}

export function alert(options) {
    if (typeof options == 'string') {
        toast({
            text: options
        });
    } else {
        baseAlert({
            title: options.title || globalize.translate('HeaderAlert'),
            text: options.message
        }).then(options.callback || function () { /* no-op */ });
    }
}

export function capabilities(host) {
    return Object.assign({
        PlayableMediaTypes: ['Audio', 'Video'],
        SupportedCommands: ['MoveUp', 'MoveDown', 'MoveLeft', 'MoveRight', 'PageUp', 'PageDown', 'PreviousLetter', 'NextLetter', 'ToggleOsd', 'ToggleContextMenu', 'Select', 'Back', 'SendKey', 'SendString', 'GoHome', 'GoToSettings', 'VolumeUp', 'VolumeDown', 'Mute', 'Unmute', 'ToggleMute', 'SetVolume', 'SetAudioStreamIndex', 'SetSubtitleStreamIndex', 'DisplayContent', 'GoToSearch', 'DisplayMessage', 'SetRepeatMode', 'SetShuffleQueue', 'ChannelUp', 'ChannelDown', 'PlayMediaSource', 'PlayTrailers'],
        SupportsPersistentIdentifier: window.appMode === 'cordova' || window.appMode === 'android',
        SupportsMediaControl: true
    }, host.getPushTokenInfo());
}

export function selectServer() {
    if (window.NativeShell && typeof window.NativeShell.selectServer === 'function') {
        window.NativeShell.selectServer();
    } else {
        navigate('selectserver');
    }
}

export function confirm(message, title, callback) {
    baseConfirm(message, title).then(function() {
        callback(true);
    }).catch(function() {
        callback(false);
    });
}

export const pageClassOn = function(eventName, className, fn) {
    document.addEventListener(eventName, function (event) {
        const target = event.target;

        if (target.classList.contains(className)) {
            fn.call(target, event);
        }
    });
};

const Dashboard = {
    alert,
    capabilities,
    confirm,
    getCurrentUser,
    getCurrentUserId,
    logout,
    navigate,
    onServerChanged,
    processErrorResponse,
    selectServer,
    serverAddress,
    datetime,
    dialogHelper,
    setBackdropTransparency
};

// This is used in plugins and templates, so keep it defined for now.
// TODO: Remove once plugins don't need it
window.Dashboard = Dashboard;

export default Dashboard;
