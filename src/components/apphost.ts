import type { BrowserDetection } from 'types/legacyPlayer';
import appSettings from '../scripts/settings/appSettings';
import detectedBrowser from '../scripts/browser';
import Events from '../utils/events';
import * as webSettings from '../scripts/settings/webSettings';
import globalize from '../lib/globalize';

import { AppFeature } from 'constants/appFeature';

const browser = detectedBrowser as BrowserDetection;

const appName = 'Jellyfin Web';

const BrowserName = {
    tizen: 'Samsung Smart TV',
    web0s: 'LG Smart TV',
    titanos: 'Titan OS',
    vega: 'Vega OS',
    operaTv: 'Opera TV',
    xboxOne: 'Xbox One',
    ps4: 'Sony PS4',
    chrome: 'Chrome',
    edgeChromium: 'Edge Chromium',
    edge: 'Edge',
    firefox: 'Firefox',
    opera: 'Opera',
    safari: 'Safari'
};

/** @returns {string | number} Numeric fallback for hosts without btoa. */
function generateDeviceId(): string | number {
    const keys = [];

    keys.push(navigator.userAgent);
    keys.push(new Date().getTime());
    if (typeof window.btoa === 'function') {
        return btoa(keys.join('|')).replace(/=/g, '1');
    }

    return new Date().getTime();
}

/** @returns {string | number | undefined} Read the existing device ID format unchanged. */
function getDeviceId(): string | number | undefined {
    if (!deviceId) {
        const key = '_deviceId2';

        deviceId = appSettings.get(key) || undefined;

        if (!deviceId) {
            deviceId = generateDeviceId();
            appSettings.set(key, deviceId);
        }
    }

    return deviceId;
}

function getDeviceName() {
    if (deviceName) {
        return deviceName;
    }

    deviceName = 'Web Browser'; // Default device name

    for (const key of Object.keys(BrowserName) as (keyof typeof BrowserName)[]) {
        if (browser[key]) {
            deviceName = BrowserName[key];
            break;
        }
    }

    if (browser.ipad) {
        deviceName += ' iPad';
    } else if (browser.iphone) {
        deviceName += ' iPhone';
    } else if (browser.android) {
        deviceName += ' Android';
    }
    return deviceName;
}

function supportsFullscreen() {
    if (browser.tv) {
        return false;
    }

    const element = document.documentElement;
    return !!(element.requestFullscreen || element.mozRequestFullScreen || element.webkitRequestFullscreen || element.msRequestFullscreen || document.createElement('video').webkitEnterFullscreen);
}

function supportsHtmlMediaAutoplay() {
    if (browser.edgeUwp || browser.tizen || browser.web0s || browser.orsay || browser.operaTv || browser.ps4 || browser.xboxOne) {
        return true;
    }

    return !browser.mobile;
}

function supportsCue() {
    try {
        const video = document.createElement('video');
        const style = document.createElement('style');

        style.textContent = 'video::cue {background: inherit}';
        document.body.appendChild(style);
        document.body.appendChild(video);

        const cue = window.getComputedStyle(video, '::cue').background;
        document.body.removeChild(style);
        document.body.removeChild(video);

        return !!cue.length;
    } catch (err) {
        console.error('error detecting cue support: ' + err);
        return false;
    }
}

function onAppVisible() {
    if (isHidden) {
        isHidden = false;
        Events.trigger(appHost, 'resume');
    }
}

function onAppHidden() {
    if (!isHidden) {
        isHidden = true;
    }
}

function supportsExternalLinks() {
    return !browser.operaTv && !browser.tizen && !browser.orsay && !browser.web0s && !browser.ps4;
}

function supportsRemoteControl() {
    return !browser.tv && !browser.xboxOne && !browser.ps4;
}

function supportsRemoteVideo() {
    return !browser.operaTv && !browser.tizen && !browser.orsay && !browser.web0s && !browser.edgeUwp;
}

const supportedFeatures = function () {
    const features: string[] = [];

    if (!browser.edgeUwp && !browser.tv && !browser.xboxOne && !browser.ps4) {
        features.push(AppFeature.FileDownload);
    }

    if (browser.operaTv || browser.tizen || browser.orsay || browser.web0s) {
        features.push(AppFeature.Exit);
    }

    if (supportsExternalLinks()) {
        features.push(AppFeature.ExternalLinks);
    }

    if (supportsHtmlMediaAutoplay()) {
        features.push(AppFeature.HtmlAudioAutoplay);
        features.push(AppFeature.HtmlVideoAutoplay);
    }

    if (supportsFullscreen()) {
        features.push(AppFeature.Fullscreen);
    }

    if (browser.tv || browser.xboxOne || browser.ps4 || browser.mobile || browser.ipad) {
        features.push(AppFeature.PhysicalVolumeControl);
    }

    if (supportsRemoteControl()) {
        features.push(AppFeature.RemoteControl);
    }

    if (supportsRemoteVideo()) {
        features.push(AppFeature.RemoteVideo);
    }

    features.push(AppFeature.DisplayLanguage);
    features.push(AppFeature.DisplayMode);
    features.push(AppFeature.TargetBlank);
    features.push(AppFeature.Screensaver);

    void webSettings.getMultiServer().then(enabled => {
        if (enabled) features.push(AppFeature.MultiServer);
    });

    if (!browser.orsay && (browser.firefox || browser.ps4 || browser.edge || supportsCue())) {
        features.push(AppFeature.SubtitleAppearance);
    }

    if (!browser.orsay) {
        features.push(AppFeature.SubtitleBurnIn);
    }

    if (!browser.tv && !browser.ps4 && !browser.xboxOne) {
        features.push(AppFeature.FileInput);
    }

    if (browser.chrome || browser.edgeChromium) {
        features.push(AppFeature.Chromecast);
    }

    return features;
}();

function doExit() {
    try {
        if (window.NativeShell?.AppHost?.exit) {
            window.NativeShell.AppHost.exit();
        } else if (browser.tizen) {
            tizen.application.getCurrentApplication().exit();
        } else if (browser.web0s) {
            webOS.platformBack();
        } else {
            window.close();
        }
    } catch (err) {
        console.error('error closing application: ' + err);
    }
}

let exitPromise: Promise<void> | null;

function askForExit() {
    if (exitPromise) {
        return;
    }

    void import('../components/actionSheet/actionSheet').then((actionsheet) => {
        exitPromise = actionsheet.show({
            title: globalize.translate('MessageConfirmAppExit'),
            items: [
                { id: 'yes', name: globalize.translate('Yes') },
                { id: 'no', name: globalize.translate('No') }
            ]
        }).then(function (value) {
            if (value === 'yes') {
                doExit();
            }
        }).finally(function () {
            exitPromise = null;
        });
    });
}

let deviceId: string | number | undefined;
let deviceName: string | undefined;

export const appHost = {
    getWindowState: function () {
        return document.windowState || 'Normal';
    },
    setWindowState: function () {
        alert('setWindowState is not supported and should not be called');
    },
    exit: function () {
        if (!!window.appMode && browser.tizen) {
            askForExit();
        } else {
            doExit();
        }
    },
    supports: function (command: string) {
        if (window.NativeShell) {
            return window.NativeShell.AppHost.supports(command);
        }

        return supportedFeatures.indexOf(command.toLowerCase()) !== -1;
    },
    preferVisualCards: browser.android || browser.chrome,
    getDeviceProfile: (item?: import('types/legacyPlayer').PlayerOptions['item'] | null, options?: { isRetry?: boolean }) =>
        import('./apphost/deviceProfile').then(profile => profile.getDeviceProfile(item, options)),
    init: function () {
        if (window.NativeShell) {
            return window.NativeShell.AppHost.init();
        }

        return {
            deviceId: getDeviceId(),
            deviceName: getDeviceName()
        };
    },
    deviceName: function () {
        return window.NativeShell?.AppHost?.deviceName ?
            window.NativeShell.AppHost.deviceName() : getDeviceName();
    },
    deviceId: function () {
        return window.NativeShell?.AppHost?.deviceId ?
            window.NativeShell.AppHost.deviceId() : getDeviceId();
    },
    appName: function () {
        return window.NativeShell?.AppHost?.appName ?
            window.NativeShell.AppHost.appName() : appName;
    },
    appVersion: function () {
        return window.NativeShell?.AppHost?.appVersion ?
            window.NativeShell.AppHost.appVersion() : __PACKAGE_JSON_VERSION__;
    },
    getPushTokenInfo: function () {
        return {};
    },
    setUserScalable: function (scalable: boolean) {
        if (!browser.tv) {
            const att = scalable ? 'width=device-width, initial-scale=1, minimum-scale=1, user-scalable=yes' : 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no';
            document.querySelector('meta[name=viewport]')!.setAttribute('content', att);
        }
    },
    screen: () => {
        let hostScreen = null;

        const appHostImpl = window.NativeShell?.AppHost;

        if (appHostImpl?.screen) {
            hostScreen = appHostImpl.screen();
        } else if (window.screen && !browser.tv) {
            hostScreen = {
                width: Math.floor(window.screen.width * window.devicePixelRatio),
                height: Math.floor(window.screen.height * window.devicePixelRatio)
            };
        }

        if (hostScreen) {
            // Use larger dimension to account for screen orientation changes
            hostScreen.maxAllowedWidth = Math.max(hostScreen.width, hostScreen.height);
        }

        return hostScreen;
    }
};

let isHidden = false;
let hidden: 'hidden' | 'webkitHidden';
let visibilityChange;

if (typeof document.hidden !== 'undefined') {
    hidden = 'hidden';
    visibilityChange = 'visibilitychange';
} else if (typeof document.webkitHidden !== 'undefined') {
    hidden = 'webkitHidden';
    visibilityChange = 'webkitvisibilitychange';
}

document.addEventListener(visibilityChange as string, function () {
    if (document[hidden]) {
        onAppHidden();
    } else {
        onAppVisible();
    }
}, false);

if (window.addEventListener) {
    window.addEventListener('focus', onAppVisible);
    window.addEventListener('blur', onAppHidden);
}
