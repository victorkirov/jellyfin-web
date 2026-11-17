import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HlsConfig } from 'hls.js';
import HtmlVideoPlayer from './plugin';
import HtmlAudioPlayer from '../htmlAudioPlayer/plugin';
import type { PlayerOptions } from 'types/legacyPlayer';
import { MediaError } from 'types/mediaError';
import Events from 'utils/events';

const mocks = vi.hoisted(() => ({
    browser: { web0s: false, tizen: false, chrome: true, tv: true, slow: true },
    imported: vi.fn(),
    bitrate: vi.fn(() => 30_000_000),
    head: vi.fn(),
    players: [] as {
        config: Partial<HlsConfig>;
        listeners: Map<string, (event: string, data?: object) => void>;
        destroy: ReturnType<typeof vi.fn>;
        recoverMediaError: ReturnType<typeof vi.fn>;
        loadSource: ReturnType<typeof vi.fn>;
    }[]
}));
vi.mock('scripts/browser', () => ({ default: mocks.browser }));
vi.mock('scripts/settings/appSettings', () => ({ default: { get: () => null, set: vi.fn(), aspectRatio: () => 'auto' } }));
vi.mock('components/apphost', () => ({ appHost: { supports: () => true } }));
vi.mock('components/loading/loading', () => ({ default: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('components/backdrop/backdrop', () => ({ setBackdropTransparency: vi.fn(), ['TRANSPARENCY_LEVEL']: {} }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: { getMaxStreamingBitrate: mocks.bitrate } }));
vi.mock('components/router/appRouter', () => ({ appRouter: {} }));
vi.mock('scripts/settings/userSettings', () => ({ selectAudioNormalization: () => 'None', currentSettings: {} }));
vi.mock('scripts/settings/webSettings', () => ({ getIncludeCorsCredentials: () => Promise.resolve(false) }));
vi.mock('utils/fetch', () => ({ ajax: mocks.head }));
vi.mock('screenfull', () => ({ default: { isEnabled: false } }));
vi.mock('hls.js/dist/hls.js', () => {
    mocks.imported();
    return { default: class {
        static readonly DefaultConfig = {};
        static readonly Events = { ['MANIFEST_PARSED']: 'manifest', ERROR: 'error' };
        listeners = new Map<string, (event: string, data?: object) => void>();
        destroy = vi.fn();
        recoverMediaError = vi.fn();
        loadSource = vi.fn();
        constructor(public config: Partial<HlsConfig>) { mocks.players.push(this); }
        on(event: string, listener: (event: string, data?: object) => void) { this.listeners.set(event, listener); }
        attachMedia() { this.listeners.get('manifest')!('manifest'); }
    } };
});

function options(audio = false): PlayerOptions {
    return {
        url: 'https://example/master.m3u8', item: {}, playerStartPositionTicks: 125_000_000,
        mediaSource: { Container: 'hls', TranscodingSubProtocol: 'hls', MediaStreams: [], RunTimeTicks: 600_000_000 },
        mediaType: audio ? 'Audio' : 'Video'
    };
}
beforeEach(() => {
    document.body.innerHTML = '';
    Object.assign(mocks.browser, { web0s: false, tizen: false, chrome: true, tv: true, slow: true });
    mocks.players.length = 0;
    mocks.bitrate.mockReturnValue(30_000_000);
    vi.stubGlobal('MediaSource', class {});
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('HLS loading through the real HTML players', () => {
    // This runs before the first enabled playback, so the import factory is still untouched.
    it.each(['web0s', 'tizen'] as const)('never imports HLS.js or probes audio HEAD on %s', async platform => {
        mocks.browser[platform] = true;
        const video = new HtmlVideoPlayer();
        const audio = new HtmlAudioPlayer();
        const audioOptions = { ...options(true), url: 'https://example/radio' };
        await video.play(options());
        await audio.play(audioOptions);
        expect(mocks.imported).not.toHaveBeenCalled();
        expect(mocks.players).toHaveLength(0);
        expect(mocks.head).not.toHaveBeenCalled();
        await video.stop(true);
        await audio.stop(true);
    });
    it('never imports HLS.js when MediaSource is unavailable', async () => {
        vi.stubGlobal('MediaSource', undefined);
        const video = new HtmlVideoPlayer();
        const audio = new HtmlAudioPlayer();
        await video.play(options());
        await audio.play(options(true));
        expect(mocks.imported).not.toHaveBeenCalled();
        expect(mocks.players).toHaveLength(0);
        await video.stop(true);
        await audio.stop(true);
    });
    it.each([['video', false], ['audio', true]] as const)('loads HLS.js lazily for %s and tears it down on Stop', async (_kind, audio) => {
        const player = audio ? new HtmlAudioPlayer() : new HtmlVideoPlayer();
        await player.play(options(audio));
        const hls = mocks.players[0];
        expect(hls).toBeDefined();
        expect(hls.loadSource).toHaveBeenCalledWith('https://example/master.m3u8#t=12.5');
        await player.stop(true);
        expect(hls.destroy).toHaveBeenCalledOnce();
    });
    it('preserves the high bitrate video buffer cap, resume position, and HDR preference', async () => {
        const player = new HtmlVideoPlayer();
        await player.play(options());
        expect(mocks.players[0].config).toMatchObject({ startPosition: 12.5, maxBufferLength: 6, maxMaxBufferLength: 6, videoPreference: { preferHDR: true } });
        await player.stop(true);
        mocks.bitrate.mockReturnValue(20_000_000);
        await player.play(options());
        expect(mocks.players[1].config.maxBufferLength).toBe(30);
        await player.stop(true);
    });
    it.each([false, true])('destroys the previous player when changing the source, audio=%s', async audio => {
        const player = audio ? new HtmlAudioPlayer() : new HtmlVideoPlayer();
        await player.play(options(audio));
        await player.play({ ...options(audio), url: 'https://example/next.m3u8' });
        expect(mocks.players[0].destroy).toHaveBeenCalledOnce();
        expect(mocks.players[1].loadSource).toHaveBeenCalledWith('https://example/next.m3u8#t=12.5');
        await player.stop(true);
        expect(mocks.players[1].destroy).toHaveBeenCalledOnce();
    });
    it.each([false, true])('recovers media-element decode errors before reporting failure, audio=%s', async audio => {
        const player = audio ? new HtmlAudioPlayer() : new HtmlVideoPlayer();
        await player.play(options(audio));
        const error = vi.fn();
        Events.on(player, 'error', error);
        const elem = document.querySelector(audio ? 'audio' : 'video')!;
        Object.defineProperty(elem, 'error', { value: { code: 3 }, configurable: true });
        elem.dispatchEvent(new Event('error'));
        expect(mocks.players[0].recoverMediaError).toHaveBeenCalledOnce();
        expect(error).not.toHaveBeenCalled();
        Object.defineProperty(elem, 'error', { value: { code: 4 } });
        elem.dispatchEvent(new Event('error'));
        expect(error).toHaveBeenCalledWith({ type: 'error' }, { type: MediaError.MEDIA_NOT_SUPPORTED });
        expect(mocks.players[0].destroy).toHaveBeenCalledOnce();
        await player.stop(true);
    });
    it('retains desktop audio fade-out before tearing down HLS', async () => {
        mocks.browser.tv = false;
        const player = new HtmlAudioPlayer();
        await player.play(options(true));
        vi.useFakeTimers();
        try {
            const stopping = player.stop(true);
            expect(mocks.players[0].destroy).not.toHaveBeenCalled();
            await vi.runAllTimersAsync();
            await stopping;
            expect(mocks.players[0].destroy).toHaveBeenCalledOnce();
        } finally {
            vi.useRealTimers();
        }
    });
    it('does not resurrect audio after Stop during a playlist HEAD request', async () => {
        let release!: (response: { headers: { get: () => string } }) => void;
        mocks.head.mockReturnValueOnce(new Promise(resolve => {
            release = resolve;
        }));
        const player = new HtmlAudioPlayer();
        const pending = player.play({ ...options(true), url: 'https://example/radio' }).catch(error => error);
        await vi.dynamicImportSettled();
        await player.stop(true);
        release({ headers: { get: () => 'application/x-mpegurl' } });
        expect(await pending).toMatchObject({ name: 'AbortError' });
        expect(mocks.players).toHaveLength(0);
    });
});
