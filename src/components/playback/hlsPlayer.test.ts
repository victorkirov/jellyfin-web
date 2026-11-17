import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaInstance } from 'lib/playback/types/htmlMedia';
import type { HlsConfig } from 'hls.js';
import Events from 'utils/events';
import { MediaError } from 'types/mediaError';
import { onEndedInternal, onErrorInternal } from '../htmlMediaHelper';
import { destroyHlsPlayer, handleHlsJsMediaError, isHlsAudioSource, startHlsPlayback } from './hlsPlayer';

const mocks = vi.hoisted(() => ({
    credentials: vi.fn().mockResolvedValue(false),
    head: vi.fn(),
    players: [] as {
        config: Partial<HlsConfig>;
        listeners: Map<string, (event: string, data?: object) => void>;
        destroy: ReturnType<typeof vi.fn>;
        recoverMediaError: ReturnType<typeof vi.fn>;
        swapAudioCodec: ReturnType<typeof vi.fn>;
        startLoad: ReturnType<typeof vi.fn>;
        loadSource: ReturnType<typeof vi.fn>;
        attachMedia: ReturnType<typeof vi.fn>;
    }[]
}));
vi.mock('scripts/settings/appSettings', () => ({ default: {} }));
vi.mock('scripts/settings/webSettings', () => ({ getIncludeCorsCredentials: mocks.credentials }));
vi.mock('utils/fetch', () => ({ ajax: mocks.head }));
vi.mock('hls.js/dist/hls.js', () => ({ default: class {
    static readonly DefaultConfig = {};
    static readonly Events = { ['MANIFEST_PARSED']: 'manifest', ERROR: 'error' };
    listeners = new Map<string, (event: string, data?: object) => void>();
    destroy = vi.fn();
    recoverMediaError = vi.fn();
    swapAudioCodec = vi.fn();
    startLoad = vi.fn();
    loadSource = vi.fn();
    attachMedia = vi.fn();
    constructor(public config: Partial<HlsConfig>) { mocks.players.push(this); }
    on(event: string, handler: (event: string, data?: object) => void) { this.listeners.set(event, handler); }
} }));

beforeEach(() => {
    mocks.players.length = 0;
    mocks.credentials.mockResolvedValue(false);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

async function setup() {
    const instance: MediaInstance = {};
    const element = document.createElement('video');
    const onError = vi.fn();
    const started = startHlsPlayback(instance, element, 'movie.m3u8', onError);
    await vi.dynamicImportSettled();
    const hls = mocks.players[0];
    return { instance, element, onError, started, hls, emit: (event: string, data?: object) => hls.listeners.get(event)!(event, data) };
}

describe('HLS source and lifecycle', () => {
    it('attaches with the configured credentials and starts playback after manifest parsing', async () => {
        mocks.credentials.mockResolvedValue(true);
        const { element, hls, emit, started } = await setup();
        expect(hls.config.manifestLoadingTimeOut).toBe(20000);
        const xhr = new XMLHttpRequest();
        await hls.config.xhrSetup!(xhr, 'movie.m3u8');
        expect(xhr.withCredentials).toBe(true);
        expect(hls.loadSource).toHaveBeenCalledWith('movie.m3u8');
        expect(hls.attachMedia).toHaveBeenCalledWith(element);
        expect(element.play).not.toHaveBeenCalled();
        emit('manifest');
        await started;
        expect(element.play).toHaveBeenCalledOnce();
    });
    it('keeps the upstream latency and back-buffer defaults', async () => {
        const { emit, started } = await setup();
        const { default: HlsPlayer } = await import('hls.js/dist/hls.js');
        expect(HlsPlayer.DefaultConfig).toMatchObject({ lowLatencyMode: false, backBufferLength: Infinity, liveBackBufferLength: 90 });
        emit('manifest');
        await started;
    });
    it('cancels startup before the dynamic import and credentials resolve', async () => {
        const instance: MediaInstance = {};
        const result = startHlsPlayback(instance, document.createElement('video'), 'movie.m3u8', vi.fn()).catch(error => error);
        destroyHlsPlayer(instance);
        expect(await result).toMatchObject({ name: 'AbortError' });
        await vi.dynamicImportSettled();
        expect(mocks.players).toHaveLength(0);
    });
    it('ignores an obsolete startup after a stream replacement', async () => {
        let release!: (value: boolean) => void;
        mocks.credentials.mockReturnValueOnce(new Promise<boolean>(resolve => {
            release = resolve;
        }));
        const instance: MediaInstance = {};
        const element = document.createElement('video');
        const old = startHlsPlayback(instance, element, 'old.m3u8', vi.fn()).catch(error => error);
        await vi.dynamicImportSettled();
        const next = startHlsPlayback(instance, element, 'new.m3u8', vi.fn());
        release(false);
        await vi.dynamicImportSettled();
        expect(await old).toMatchObject({ name: 'AbortError' });
        expect(mocks.players).toHaveLength(1);
        expect(mocks.players[0].loadSource).toHaveBeenCalledWith('new.m3u8');
        mocks.players[0].listeners.get('manifest')!('manifest');
        await next;
    });
    it('tears down exactly once on stopped and subsequent destroy', async () => {
        const { instance, element, emit, started, hls } = await setup();
        emit('manifest');
        await started;
        onEndedInternal(instance, element, vi.fn());
        destroyHlsPlayer(instance);
        expect(hls.destroy).toHaveBeenCalledOnce();
        expect(instance._hlsPlayer).toBeNull();
    });
    it('tears down on the common media error path', async () => {
        const { instance, emit, started, hls } = await setup();
        emit('manifest');
        await started;
        const error = vi.fn();
        Events.on(instance, 'error', error);
        onErrorInternal(instance, MediaError.MEDIA_NOT_SUPPORTED);
        expect(hls.destroy).toHaveBeenCalledOnce();
        expect(error).toHaveBeenCalledWith({ type: 'error' }, { type: MediaError.MEDIA_NOT_SUPPORTED });
    });
    it.each([
        [{ type: 'networkError', response: { code: 404 }, fatal: false }, MediaError.SERVER_ERROR],
        [{ type: 'networkError', response: { code: 0 }, fatal: true }, MediaError.NETWORK_ERROR],
        [{ type: 'otherError', fatal: true }, MediaError.FATAL_HLS_ERROR]
    ])('rejects unrecoverable startup errors and destroys the player: %j', async (data, type) => {
        const { emit, started, hls } = await setup();
        const rejected = expect(started).rejects.toBe(type);
        emit('error', data);
        await rejected;
        expect(hls.destroy).toHaveBeenCalledOnce();
    });
    it('reports fatal errors after playback starts', async () => {
        const { instance, emit, started, hls } = await setup();
        emit('manifest');
        await started;
        const error = vi.fn();
        Events.on(instance, 'error', error);
        emit('error', { type: 'otherError', fatal: true });
        expect(hls.destroy).toHaveBeenCalledOnce();
        expect(error).toHaveBeenCalledWith({ type: 'error' }, { type: MediaError.FATAL_HLS_ERROR });
    });
    it('retries recoverable network errors while ignoring nonfatal warnings', async () => {
        const { emit, started, hls } = await setup();
        emit('error', { type: 'networkError', fatal: true });
        expect(hls.startLoad).toHaveBeenCalledOnce();
        emit('error', { type: 'otherError', fatal: false });
        expect(hls.destroy).not.toHaveBeenCalled();
        emit('manifest');
        await started;
    });
    it('recovers decoding, swaps audio once, then fails within the recovery window', async () => {
        const { instance, emit, started, hls } = await setup();
        emit('manifest');
        await started;
        vi.spyOn(performance, 'now').mockReturnValue(0);
        const error = vi.fn();
        Events.on(instance, 'error', error);
        handleHlsJsMediaError(instance);
        handleHlsJsMediaError(instance);
        expect(hls.recoverMediaError).toHaveBeenCalledTimes(2);
        expect(hls.swapAudioCodec).toHaveBeenCalledOnce();
        handleHlsJsMediaError(instance);
        expect(hls.destroy).toHaveBeenCalledOnce();
        expect(error).toHaveBeenCalledWith({ type: 'error' }, { type: MediaError.FATAL_HLS_ERROR });
    });
    it('allows another decoder recovery after the three-second window', async () => {
        const { instance, emit, started, hls } = await setup();
        emit('manifest');
        await started;
        const now = vi.spyOn(performance, 'now').mockReturnValue(0);
        handleHlsJsMediaError(instance);
        now.mockReturnValue(3001);
        handleHlsJsMediaError(instance);
        expect(hls.recoverMediaError).toHaveBeenCalledTimes(2);
        expect(hls.swapAudioCodec).not.toHaveBeenCalled();
        destroyHlsPlayer(instance);
    });
    it("ignores a replaced source's late play rejection", async () => {
        const { instance, element, emit, started, hls } = await setup();
        let failPlay!: (error: Error) => void;
        vi.mocked(element.play).mockReturnValueOnce(new Promise<void>((_resolve, reject) => {
            failPlay = reject;
        }));
        const old = started.catch(error => error);
        emit('manifest');
        const next = startHlsPlayback(instance, element, 'next.m3u8', vi.fn());
        await vi.dynamicImportSettled();
        mocks.players[1].listeners.get('manifest')!('manifest');
        await next;
        failPlay(new Error('late decoder failure'));
        await Promise.resolve();
        await Promise.resolve();
        expect(await old).toMatchObject({ name: 'AbortError' });
        expect(hls.destroy).toHaveBeenCalledOnce();
        expect(mocks.players[1].destroy).not.toHaveBeenCalled();
        destroyHlsPlayer(instance);
    });
    it('cleans up a rejected media.play and ignores a late manifest after destroy', async () => {
        const { instance, element, emit, started, hls } = await setup();
        vi.mocked(element.play).mockRejectedValue(new Error('decoder'));
        const rejected = expect(started).rejects.toBe(MediaError.FATAL_HLS_ERROR);
        emit('manifest');
        await rejected;
        expect(hls.destroy).toHaveBeenCalledOnce();
        vi.mocked(element.play).mockClear();
        emit('manifest');
        expect(element.play).not.toHaveBeenCalled();
        expect(instance._hlsPlayer).toBeNull();
    });
    it('rejects failed credentials lookup without leaving a pending request', async () => {
        mocks.credentials.mockRejectedValueOnce(new Error('settings'));
        const instance: MediaInstance = {};
        await expect(startHlsPlayback(instance, document.createElement('audio'), 'audio.m3u8', vi.fn())).rejects.toThrow('settings');
        expect(instance._hlsRequest).toBeNull();
    });
    it('detects audio playlists by extension or HEAD content type and falls back on HEAD failure', async () => {
        expect(await isHlsAudioSource('audio.m3u8')).toBe(true);
        mocks.head.mockResolvedValue({ headers: { get: () => 'application/vnd.apple.mpegurl' } });
        expect(await isHlsAudioSource('radio')).toBe(true);
        expect(mocks.head).toHaveBeenCalledWith({ url: 'radio', type: 'HEAD' });
        mocks.head.mockResolvedValue({ headers: { get: () => 'audio/mpeg' } });
        expect(await isHlsAudioSource('song')).toBe(false);
        mocks.head.mockRejectedValue(new Error('offline'));
        expect(await isHlsAudioSource('radio')).toBe(false);
    });
});
