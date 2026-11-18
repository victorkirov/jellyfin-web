import { authenticateUserByName, authenticateQuickConnect } from './loginAuthentication';
import { loadUserList } from './loginUserList';
import createDOMPurify from 'dompurify';

import { AppFeature } from 'constants/appFeature';
import { ServerConnections } from 'lib/jellyfin-apiclient';

import { appHost } from 'components/apphost';
import appSettings from 'scripts/settings/appSettings';
import dom from 'utils/dom';
import { renderMarkdown } from 'utils/markdown';
import loading from 'components/loading/loading';
import layoutManager from 'lib/layoutManager';
import libraryMenu from 'scripts/libraryMenu';
import 'components/cardbuilder/card.scss';
import 'elements/emby-checkbox/emby-checkbox';
import Dashboard from 'components/dashboard';

import './login.scss';

const domPurify = createDOMPurify();
domPurify.setConfig({
    // eslint-disable-next-line @typescript-eslint/naming-convention, sonarjs/regex-complexity -- DOMPurify config option; customizes its default regex
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|callto|cid|xmpp|matrix|tg|whatsapp|signal|ircs?):|[^a-z]|[a-z+.-]+(?:[^-a-z+.:]|$))/i
});

function showManualForm(context: HTMLElement, showCancel: boolean, focusPassword = false) {
    context.querySelector<HTMLInputElement>('.chkRememberLogin')!.checked = appSettings.enableAutoLogin();
    context.querySelector<HTMLElement>('.manualLoginForm')!.classList.remove('hide');
    context.querySelector<HTMLElement>('.visualLoginForm')!.classList.add('hide');
    context.querySelector<HTMLElement>('.btnManual')!.classList.add('hide');

    if (focusPassword) {
        context.querySelector<HTMLInputElement>('#txtManualPassword')!.focus();
    } else {
        context.querySelector<HTMLInputElement>('#txtManualName')!.focus();
    }

    if (showCancel) {
        context.querySelector<HTMLElement>('.btnCancel')!.classList.remove('hide');
    } else {
        context.querySelector<HTMLElement>('.btnCancel')!.classList.add('hide');
    }
}

export default function (view: HTMLElement, params: { serverid?: string; url?: string }) {
    let generation = 0;
    let active = false;
    let destroyed = false;
    let loadingVisible = false;
    function hideLoading() {
        if (!loadingVisible) return;
        loadingVisible = false;
        loading.hide();
    }
    function invalidate() {
        active = false;
        generation++;
        hideLoading();
    }
    function getApiClient() {
        const serverId = params.serverid;

        if (serverId) {
            return ServerConnections.getOrCreateApiClient(serverId);
        }

        return window.ApiClient;
    }

    function getTargetUrl() {
        if (params.url) {
            try {
                return decodeURIComponent(params.url);
            } catch (err) {
                console.warn('[LoginPage] unable to decode url param', params.url, err);
            }
        }

        return '/home';
    }

    function showVisualForm() {
        const request = generation;
        view.querySelector<HTMLElement>('.visualLoginForm')!.classList.remove('hide');
        view.querySelector<HTMLElement>('.manualLoginForm')!.classList.add('hide');
        view.querySelector<HTMLElement>('.btnManual')!.classList.remove('hide');

        void import('components/autoFocuser').then(({ default: autoFocuser }) => {
            if (active && !destroyed && request === generation) autoFocuser.autoFocus(view);
        }).catch(error => {
            if (active && request === generation) console.error('Failed to focus login users', error);
        });
    }

    view.querySelector<HTMLElement>('#divUsers')!.addEventListener('click', function (e) {
        const card = dom.parentWithClass(e.target as HTMLElement, 'card');
        const cardContent = card ? card.querySelector('.cardContent') : null;

        if (cardContent) {
            const context = view;
            const id = cardContent.getAttribute('data-userid');
            const name = cardContent.getAttribute('data-username')!;
            const haspw = cardContent.getAttribute('data-haspw');

            if (id === 'manual') {
                context.querySelector<HTMLInputElement>('#txtManualName')!.value = '';
                showManualForm(context, true);
            } else if (haspw == 'false') {
                authenticateUserByName(context, getApiClient(), getTargetUrl(), name, '');
            } else {
                context.querySelector<HTMLInputElement>('#txtManualName')!.value = name;
                context.querySelector<HTMLInputElement>('#txtManualPassword')!.value = '';
                showManualForm(context, true, true);
            }
        }
    });
    view.querySelector<HTMLElement>('.manualLoginForm')!.addEventListener('submit', function (e) {
        appSettings.enableAutoLogin(view.querySelector<HTMLInputElement>('.chkRememberLogin')!.checked);
        authenticateUserByName(view, getApiClient(), getTargetUrl(), view.querySelector<HTMLInputElement>('#txtManualName')!.value, view.querySelector<HTMLInputElement>('#txtManualPassword')!.value);
        e.preventDefault();
        return false;
    });
    view.querySelector<HTMLElement>('.btnForgotPassword')!.addEventListener('click', function () {
        void Dashboard.navigate('forgotpassword');
    });
    view.querySelector<HTMLElement>('.btnCancel')!.addEventListener('click', showVisualForm);
    view.querySelector<HTMLElement>('.btnQuick')!.addEventListener('click', function () {
        authenticateQuickConnect(getApiClient(), getTargetUrl());
        return false;
    });
    view.querySelector<HTMLElement>('.btnManual')!.addEventListener('click', function () {
        view.querySelector<HTMLInputElement>('#txtManualName')!.value = '';
        showManualForm(view, true);
    });
    view.querySelector<HTMLElement>('.btnSelectServer')!.addEventListener('click', function () {
        Dashboard.selectServer();
    });

    view.addEventListener('viewshow', function () {
        if (destroyed) return;
        active = true;
        const request = ++generation;
        const isCurrent = () => active && !destroyed && request === generation;
        loadingVisible = true;
        loading.show();
        libraryMenu.setTransparentMenu(true);

        if (!appHost.supports(AppFeature.MultiServer)) {
            view.querySelector<HTMLElement>('.btnSelectServer')!.classList.add('hide');
        }

        const apiClient = getApiClient();

        apiClient.getQuickConnect('Enabled')
            .then(enabled => {
                if (isCurrent() && enabled === true) {
                    view.querySelector<HTMLElement>('.btnQuick')!.classList.remove('hide');
                }
            })
            .catch(() => {
                if (isCurrent()) console.debug('Failed to get QuickConnect status');
            });

        void apiClient.getPublicUsers().then(function (users) {
            if (!isCurrent()) return;
            if (users.length) {
                showVisualForm();
                loadUserList(view, apiClient, users);
            } else {
                view.querySelector<HTMLInputElement>('#txtManualName')!.value = '';
                showManualForm(view, false, false);
            }
        }).catch(() => {
            if (!isCurrent()) return;
            showManualForm(view, false);
        }).then(() => {
            if (isCurrent()) hideLoading();
        });
        void apiClient.getJSON(apiClient.getUrl('Branding/Configuration')).then(function (options) {
            if (!isCurrent()) return;
            const loginDisclaimer = view.querySelector<HTMLElement>('.loginDisclaimer')!;

            loginDisclaimer.innerHTML = domPurify.sanitize(renderMarkdown(options.LoginDisclaimer || ''));

            for (const elem of loginDisclaimer.querySelectorAll('a')) {
                elem.rel = 'noopener noreferrer';
                elem.target = '_blank';
                elem.classList.add('button-link');
                elem.setAttribute('is', 'emby-linkbutton');

                if (layoutManager.tv) {
                    // Disable links navigation on TV
                    elem.tabIndex = -1;
                }
            }
        }).catch(() => {
            if (isCurrent()) console.debug('Failed to get optional login branding');
        });
    });
    view.addEventListener('viewbeforehide', invalidate);
    view.addEventListener('viewdestroy', () => {
        destroyed = true;
        invalidate();
    });
    view.addEventListener('viewhide', function () {
        invalidate();
        libraryMenu.setTransparentMenu(false);
    });
}
