import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as media from './htmlMediaHelper';

const browser = vi.hoisted(() => ({ chrome: true, edgeChromium: false, opera: false, web0s: false, tizen: false, iOS: false, android: false, safari: false }));
vi.mock('scripts/browser', () => ({ default: browser }));
vi.mock('scripts/settings/appSettings', () => ({ default: {} }));
beforeEach(() => {
    Object.assign(browser, { chrome: true, edgeChromium: false, opera: false, web0s: false, tizen: false, iOS: false, android: false, safari: false });
    vi.stubGlobal('MediaSource', class {});
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('');
});
afterEach(() => vi.unstubAllGlobals());

describe('upstream HLS player selection', () => {
    it.each(['web0s', 'tizen', 'iOS'] as const)('uses the native player on %s', platform => {
        browser[platform] = true;
        expect(media.enableHlsJsPlayer(60, 'Video')).toBe(false);
    });
    it('uses HLS.js for desktop Chrome without native HLS', () => {
        expect(media.enableHlsJsPlayer(60, 'Video')).toBe(true);
    });
    it('requires MediaSource', () => {
        vi.stubGlobal('MediaSource', undefined);
        expect(media.enableHlsJsPlayer(60, 'Video')).toBe(false);
    });
    it.each(['chrome', 'edgeChromium', 'opera'] as const)('uses HLS.js with native HLS on %s', platform => {
        browser.chrome = false;
        browser[platform] = true;
        vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue('probably');
        expect(media.enableHlsJsPlayer(60, 'Video')).toBe(true);
    });
    it('uses native Safari for finite media and HLS.js for live streams', () => {
        browser.chrome = false;
        browser.safari = true;
        vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue('maybe');
        expect(media.enableHlsJsPlayer(60, 'Video')).toBe(false);
        expect(media.enableHlsJsPlayer(0, 'Video')).toBe(true);
    });
    it('uses HLS.js for native Android audio and video', () => {
        browser.chrome = false;
        browser.android = true;
        vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue('maybe');
        expect(media.enableHlsJsPlayer(60, 'Audio')).toBe(true);
        expect(media.enableHlsJsPlayer(60, 'Video')).toBe(true);
        expect(media.enableHlsJsPlayer(60, 'Other')).toBe(false);
    });
    it('forces desktop Safari VP9 through HLS.js, while leaving iOS native', () => {
        browser.chrome = false;
        browser.safari = true;
        vi.mocked(HTMLMediaElement.prototype.canPlayType).mockReturnValue('probably');
        const source = { RunTimeTicks: 60, MediaStreams: [{ Codec: 'vp9' }] };
        expect(media.enableHlsJsPlayerForCodecs(source, 'Video')).toBe(true);
        browser.iOS = true;
        expect(media.enableHlsJsPlayerForCodecs(source, 'Video')).toBe(false);
    });
});
