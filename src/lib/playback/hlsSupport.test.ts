import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableHlsJsPlayer, enableHlsJsPlayerForCodecs } from './hlsSupport';

const browser = vi.hoisted(() => ({ web0s: true }));
vi.mock('scripts/browser', () => ({ default: browser }));
afterEach(() => {
    browser.web0s = true;
    vi.unstubAllGlobals();
});

describe('native HLS selection', () => {
    it('keeps webOS on its native HLS source even when MediaSource exists', () => {
        vi.stubGlobal('MediaSource', class {});
        expect(enableHlsJsPlayer(600_000_000, 'Video')).toBe(false);
        expect(enableHlsJsPlayerForCodecs({ RunTimeTicks: 600_000_000, MediaStreams: [{ Codec: 'hevc' }] }, 'Video')).toBe(false);
    });

    it('retains ordinary browser native HLS for finite video', () => {
        browser.web0s = false;
        vi.stubGlobal('MediaSource', class {});
        vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('probably');
        expect(enableHlsJsPlayer(600_000_000, 'Video')).toBe(false);
    });
});
