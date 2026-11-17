import { describe, expect, it } from 'vitest';

import { detectBrowser } from './browser';

describe('Browser', () => {
    it('should identify TitanOS devices', () => {
        // Ref: https://docs.titanos.tv/user-agents-specifications
        // Philips example
        let browser = detectBrowser('Mozilla/5.0 (Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.4147.62 Safari/537.36 OPR/46.0.2207.0 OMI/4.24, TV_NT72690_2025_4K /<SW version> (Philips, <CTN>, wired) CE-HTML/1.0 NETTV/4.6.0.8 SignOn/2.0 SmartTvA/5.0.0 TitanOS/3.0 en Ginga');
        expect(browser.titanos).toBe(true);
        expect(browser.operaTv).toBeFalsy();
        expect(browser.safari).toBeFalsy();
        expect(browser.tv).toBe(true);

        // JVC example
        browser = detectBrowser('Mozilla/5.0 (Linux ) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.128 Safari/537.36 OMI/4.24.3.93.MIKE.227 Model/Vestel-MB190 VSTVB MB100 FVC/9.0 (VESTEL; MB190; ) HbbTV/1.7.1 (+DRM; VESTEL; MB190; 0.9.0.0; ; _TV__2025;) TitanOS/3.0 (Vestel MB190 VESTEL) SmartTvA/3.0.0');
        expect(browser.titanos).toBe(true);
        expect(browser.operaTv).toBeFalsy();
        expect(browser.safari).toBeFalsy();
        expect(browser.tv).toBe(true);
    });

    it('should identify Vega devices', () => {
        // Ref: https://developer.amazon.com/docs/vega/0.21/webview-development-best-practices-tv.html#avoid-relying-on-the-useragent
        const browser = detectBrowser('Mozilla/5.0 (Linux; Kepler 1.1; AFTCA002 user/1234; wv) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Chrome/130.0.6723.192 Safari/537.36');
        expect(browser.vega).toBe(true);
        expect(browser.chrome).toBeFalsy();
        expect(browser.safari).toBeFalsy();
        expect(browser.mobile).toBeFalsy();
        expect(browser.tv).toBe(true);
    });

    it('should identify Xbox devices', () => {
        const browser = detectBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0 WebView2 Xbox');
        expect(browser.xboxOne).toBe(true);
        expect(browser.tv).toBe(true);
    });

    it('should identify Samsung Tizen TV devices', () => {
        // 2024 Samsung TV (Tizen 8.0)
        const browser = detectBrowser('Mozilla/5.0 (SMART-TV; Linux; Tizen 8.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/7.0 Chrome/108.0.5359.1 TV Safari/537.36');
        expect(browser.tizen).toBe(true);
        expect(browser.tizenVersion).toBe(8);
        expect(browser.tv).toBe(true);
        expect(browser.mobile).toBeFalsy();
    });

    it('should not identify Samsung Browser (Android) as a TV', () => {
        // Ref: https://developer.samsung.com/browser/user-agent-string-format.html
        const browser = detectBrowser('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36');
        expect(browser.android).toBe(true);
        expect(browser.mobile).toBe(true);
        expect(browser.tizen).toBeFalsy();
        expect(browser.tv).toBeFalsy();
    });
});

describe('legacy platform detection characterization', () => {
    it.each([
        [26, 1], [34, 2], [38, 3], [53, 4], [68, 5], [79, 6],
        [87, 22], [94, 23], [108, 24], [120, 25]
    ])('keeps Chrome %s mapped to webOS %s', (chromeVersion, webosVersion) => {
        const result = detectBrowser(`Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/${chromeVersion}.0.0.0 Safari/537.36`);
        expect(result.web0s).toBe(true);
        expect(result.web0sVersion).toBe(webosVersion);
        expect(result.versionMajor).toBe(chromeVersion);
        expect(result.tv).toBe(true);
        expect(result.slow).toBe(true);
        expect(result.keyboard).toBe(true);
        expect('chrome' in result).toBe(false);
        expect('safari' in result).toBe(false);
    });

    it('preserves missing version fields and false TV detection for unknown agents', () => {
        const result = detectBrowser('unknown');
        expect('version' in result).toBe(false);
        expect('versionMajor' in result).toBe(false);
        expect(result.web0s).toBe(false);
        expect(result.tv).toBe(false);
        expect('slow' in result).toBe(false);
    });

    it('keeps Oculus browsers out of TV classification', () => {
        const result = detectBrowser('Mozilla/5.0 OculusBrowser/30.0 SamsungBrowser/4.0 Chrome/120.0.0.0 Safari/537.36');
        expect(result.tv).toBe(false);
    });
});

it('does not expose the unused CSS animation capability probe', () => {
    expect('supportsCssAnimation' in detectBrowser('unknown')).toBe(false);
    expect('animate' in detectBrowser('unknown')).toBe(false);
});
