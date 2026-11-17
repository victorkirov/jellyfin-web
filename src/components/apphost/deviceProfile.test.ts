import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDeviceProfile } from './deviceProfile';

const mocks = vi.hoisted(() => ({
    browser: { chrome: true, edge: false, edgeChromium: false, firefox: false, web0s: false, tizen: false },
    build: vi.fn(() => ({ CodecProfiles: [], TranscodingProfiles: [] }))
}));
vi.mock('scripts/browser', () => ({ default: mocks.browser }));
vi.mock('scripts/browserDeviceProfile', () => ({ default: mocks.build }));
vi.mock('scripts/settings/appSettings', () => ({ default: {
    maxVideoWidth: () => 0,
    preferredTranscodeVideoCodec: () => null,
    preferredTranscodeVideoAudioCodec: () => null
} }));
vi.mock('../apphost', () => ({ appHost: { screen: () => null } }));
beforeEach(() => {
    Object.assign(mocks.browser, { chrome: true, edge: false, edgeChromium: false, firefox: false, web0s: false, tizen: false });
    mocks.build.mockClear();
    vi.stubGlobal('MediaSource', class {});
    vi.stubGlobal('NativeShell', undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('');
});
afterEach(() => vi.unstubAllGlobals());

describe('HLS device profile restrictions', () => {
    it.each([
        ['chrome', ['ac3', 'eac3']],
        ['edgeChromium', []],
        ['edge', ['mp3', 'ac3', 'eac3', 'opus']],
        ['web0s', []],
        ['tizen', []]
    ] as const)('preserves upstream codec exclusions for %s', async (platform, codecs) => {
        mocks.browser.chrome = false;
        mocks.browser[platform] = true;
        await getDeviceProfile({ RunTimeTicks: 60, MediaType: 'Video' });
        expect(mocks.build).toHaveBeenCalledWith({ enableMkvProgressive: false, disableHlsVideoAudioCodecs: codecs });
    });
    it('does not restrict profiles when no item is supplied', async () => {
        await getDeviceProfile();
        expect(mocks.build).toHaveBeenCalledWith({ enableMkvProgressive: false, disableHlsVideoAudioCodecs: [] });
    });
    it('retains the native shell profile builder', async () => {
        const profile = { CodecProfiles: [], TranscodingProfiles: [] };
        const nativeProfile = vi.fn().mockReturnValue(profile);
        vi.stubGlobal('__PACKAGE_JSON_VERSION__', 'test');
        vi.stubGlobal('NativeShell', { AppHost: { getDeviceProfile: nativeProfile } });
        expect(await getDeviceProfile({ RunTimeTicks: 60, MediaType: 'Video' })).toBe(profile);
        expect(nativeProfile).toHaveBeenCalledWith(mocks.build, 'test');
        expect(mocks.build).not.toHaveBeenCalled();
    });
});
