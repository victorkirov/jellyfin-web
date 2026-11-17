import type { Browser } from './browserTypes';

export function isTv(userAgent: string) {
    // This is going to be really difficult to get right

    // The OculusBrowsers userAgent also has the samsungbrowser defined but is not a tv.
    if (userAgent.includes('oculusbrowser')) {
        return false;
    }

    if (userAgent.includes('tv')) {
        return true;
    }

    if (userAgent.includes('viera')) {
        return true;
    }

    if (userAgent.includes('titanos')) {
        return true;
    }

    return isWeb0s(userAgent);
}

export function isWeb0s(userAgent: string) {
    return userAgent.includes('netcast')
        || userAgent.includes('web0s');
}

export function isMobile(userAgent: string) {
    const terms = [
        'mobi',
        'ipad',
        'iphone',
        'ipod',
        'silk',
        'gt-p1000',
        'nexus 7',
        'kindle fire',
        'opera mini'
    ];

    for (const term of terms) {
        if (userAgent.includes(term)) {
            return true;
        }
    }

    return false;
}

export function hasKeyboard(browser: Browser) {
    if (browser.touch) {
        return true;
    }

    if (browser.xboxOne) {
        return true;
    }

    if (browser.ps4) {
        return true;
    }

    if (browser.edgeUwp) {
        // This is OK for now, but this won't always be true
        // Should we use this?
        // https://gist.github.com/wagonli/40d8a31bd0d6f0dd7a5d
        return true;
    }

    return !!browser.tv;
}

export function iOSversion() {
    // MacIntel: Apple iPad Pro 11 iOS 13.1
    if (/iP(hone|od|ad)|MacIntel/.test(navigator.platform)) {
        const tests = [
            // Original test for getting full iOS version number in iOS 2.0+
            /OS (\d+)_(\d+)_?(\d+)?/,
            // Test for iPads running iOS 13+ that can only get the major OS version
            /Version\/(\d+)/
        ];
        for (const test of tests) {
            const matches = RegExp(test).exec(navigator.appVersion);
            if (matches) {
                return [
                    parseInt(matches[1], 10),
                    parseInt(matches[2] || '0', 10),
                    parseInt(matches[3] || '0', 10)
                ];
            }
        }
    }
    return [];
}

export function web0sVersion(browser: Browser) {
    // Detect webOS version by web engine version

    if (browser.chrome) {
        const userAgent = navigator.userAgent.toLowerCase();

        if (userAgent.includes('netcast')) {
            // The built-in browser (NetCast) may have a version that doesn't correspond to the actual web engine
            // Since there is no reliable way to detect webOS version, we return an undefined version

            console.warn('Unable to detect webOS version - NetCast');

            return undefined;
        }

        // The next is only valid for the app

        const version = chromeWeb0sVersion(browser.versionMajor);
        if (version !== undefined) return version;
    } else if (browser.versionMajor! >= 538) {
        // webOS 2 app
        return 2;
    } else if (browser.versionMajor! >= 537) {
        // webOS 1 app
        return 1;
    }

    console.error('Unable to detect webOS version');

    return undefined;
}

function chromeWeb0sVersion(versionMajor: number | undefined) {
    if (versionMajor! >= 120) {
        return 25;
    } else if (versionMajor! >= 108) {
        return 24;
    } else if (versionMajor! >= 94) {
        return 23;
    } else if (versionMajor! >= 87) {
        return 22;
    } else if (versionMajor! >= 79) {
        return 6;
    } else if (versionMajor! >= 68) {
        return 5;
    } else if (versionMajor! >= 53) {
        return 4;
    } else if (versionMajor! >= 38) {
        return 3;
    } else if (versionMajor! >= 34) {
        // webOS 2 browser
        return 2;
    } else if (versionMajor! >= 26) {
        // webOS 1 browser
        return 1;
    }
}
