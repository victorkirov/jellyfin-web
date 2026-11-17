import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackManager } from './playbackmanager';
import { createPlaybackControls } from './playbackControls';
import Events from '../../utils/events';
import { pluginManager } from '../pluginManager';
import { MediaError } from 'types/mediaError';

const mocks = vi.hoisted(() => ({
    players: [] as object[],
    interceptors: [] as object[],
    alert: vi.fn(),
    getPostedPlaybackInfo: vi.fn(),
    detectBitrate: vi.fn(),
    localItem: vi.fn(() => false),
    automaticBitrate: vi.fn(() => false),
    maxBitrate: vi.fn(() => 20_000_000),
    loading: { show: vi.fn(), hide: vi.fn() },
    apiClient: {
        getEndpointInfo: vi.fn(), getSavedEndpointInfo: () => ({}),
        getCurrentUser: vi.fn(), getCurrentUserId: () => 'user',
        getItem: vi.fn(), serverId: () => 'server',
        deviceId: () => 'tv', accessToken: () => 'test',
        getUrl: (path: string) => 'https://server/' + path,
        reportPlaybackStart: vi.fn(), reportPlaybackStopped: vi.fn(), reportPlaybackProgress: vi.fn(),
        stopActiveEncodings: vi.fn(), closeLiveStream: vi.fn()
    }
}));
vi.mock('@jellyfin/sdk/lib/utils/api/media-info-api', () => ({ getMediaInfoApi: () => ({ getPostedPlaybackInfo: mocks.getPostedPlaybackInfo }) }));
vi.mock('../pluginManager', () => ({ pluginManager: { prepareForPlayback: vi.fn().mockResolvedValue(undefined), canPlayDeferred: () => false, ofType: (type: string) => type === 'mediaplayer' ? mocks.players : mocks.interceptors } }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApi: () => ({}), getApiClient: () => mocks.apiClient, currentApiClient: () => mocks.apiClient } }));
vi.mock('../../scripts/settings/appSettings', () => ({ default: {
    enableAutomaticBitrateDetection: mocks.automaticBitrate, maxStreamingBitrate: mocks.maxBitrate,
    alwaysBurnInSubtitleWhenTranscoding: () => false
} }));
vi.mock('../itemHelper', () => ({ default: { isLocalItem: mocks.localItem } }));
vi.mock('../../scripts/settings/userSettings', () => ({ enableCinemaMode: () => false, defaultPlayer: () => null }));
vi.mock('../../lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('../loading/loading', () => ({ default: mocks.loading }));
vi.mock('../alert', () => ({ default: mocks.alert }));
vi.mock('../apphost', () => ({ appHost: { supports: () => false, getDefaultLayout: () => 'tv' } }));
vi.mock('utils/bitrateTest', () => ({ detectBitrate: mocks.detectBitrate }));
vi.mock('../../utils/jellyfin-apiclient/backdropImage', () => ({ getItemBackdropImageUrl: () => null }));
vi.mock('screenfull', () => ({ default: { isEnabled: false } }));
vi.mock('lib/playback/utils/mediaSegmentManager', () => ({ bindMediaSegmentManager: vi.fn() }));
vi.mock('lib/playback/utils/mediaSessionSubscriber', () => ({ bindMediaSessionSubscriber: vi.fn() }));
vi.mock('./skipsegment.ts', () => ({ bindSkipSegment: vi.fn() }));

const item = { Id: 'item', ServerId: 'server', Type: 'Movie', MediaType: 'Video' } as const;
const source = (transcode = false) => ({
    Id: 'item', MediaStreams: [], SupportsDirectStream: !transcode, SupportsTranscoding: transcode,
    TranscodingUrl: 'video?AllowVideoStreamCopy=false&AllowAudioStreamCopy=false&PlaySessionId=session',
    Container: 'mp4', RunTimeTicks: 600_000_000
});

function setup() {
    const player = {
        name: 'fake', id: 'fake', isLocalPlayer: true,
        streamInfo: undefined as object | undefined, isChangingStream: false, supports: () => false,
        getVolume: () => 100, setVolume: vi.fn(), canPlayMediaType: () => true, canPlayUrl: () => true,
        getDeviceProfile: vi.fn().mockResolvedValue({}), play: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn(), stop: vi.fn().mockImplementation(() => {
            Events.trigger(player, 'stopped');
            return Promise.resolve();
        }),
        currentTime: () => 0, duration: () => 60, paused: () => false, isMuted: () => false,
        getRepeatMode: () => 'RepeatNone', getPlaybackRate: () => 1
    };
    mocks.players.push(player);
    const manager = new PlaybackManager();
    return { manager, player, play: () => manager.play({ items: [{ ...item }] }) };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pluginManager.prepareForPlayback).mockResolvedValue(undefined);
    mocks.players.length = 0;
    mocks.interceptors.length = 0;
    mocks.localItem.mockReturnValue(false);
    mocks.automaticBitrate.mockReturnValue(false);
    mocks.apiClient.getEndpointInfo.mockResolvedValue({});
    mocks.apiClient.getCurrentUser.mockResolvedValue({ Id: 'user', Configuration: {} });
    mocks.apiClient.getItem.mockResolvedValue(item);
    mocks.apiClient.reportPlaybackStart.mockResolvedValue(undefined);
    mocks.apiClient.reportPlaybackStopped.mockResolvedValue(undefined);
    mocks.apiClient.reportPlaybackProgress.mockResolvedValue(undefined);
    mocks.apiClient.stopActiveEncodings.mockResolvedValue(undefined);
    mocks.apiClient.closeLiveStream.mockResolvedValue(undefined);
    mocks.getPostedPlaybackInfo.mockResolvedValue({ data: { MediaSources: [source()] } });
    vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('playback HTTP failures and bitrate bypass', () => {
    it.each([401, 404, 500])('classifies SDK HTTP %s errors', async status => {
        const { play } = setup();
        mocks.getPostedPlaybackInfo.mockRejectedValue({ response: { status } });
        await play();
        expect(mocks.alert).toHaveBeenCalledWith(expect.objectContaining({
            text: `PlaybackError.${status >= 500 ? MediaError.SERVER_ERROR : MediaError.NO_MEDIA_ERROR}`
        }));
    });

    it.each([new TypeError('network'), new DOMException('cancelled', 'AbortError')])('handles non-HTTP %s errors', async error => {
        const { play } = setup();
        mocks.getPostedPlaybackInfo.mockRejectedValue(error);
        await play();
        expect(mocks.alert).toHaveBeenCalledWith(expect.objectContaining({ text: 'ErrorDefault' }));
    });

    it('uses the saved bitrate normally when automatic detection is disabled', async () => {
        const { play, manager, player } = setup();
        const reject = vi.spyOn(Promise, 'reject');
        await play();
        expect(reject).not.toHaveBeenCalled();
        expect(mocks.detectBitrate).not.toHaveBeenCalled();
        expect(mocks.getPostedPlaybackInfo).toHaveBeenCalledWith(expect.objectContaining({
            playbackInfoDto: expect.objectContaining({ MaxStreamingBitrate: 20_000_000 })
        }));
        await manager.stop(player);
    });
    it('falls back to the saved bitrate when detection fails', async () => {
        const { play, manager, player } = setup();
        mocks.automaticBitrate.mockReturnValue(true);
        mocks.detectBitrate.mockRejectedValue(new Error('offline'));
        await play();
        expect(mocks.detectBitrate).toHaveBeenCalledOnce();
        expect(mocks.getPostedPlaybackInfo).toHaveBeenCalledWith(expect.objectContaining({
            playbackInfoDto: expect.objectContaining({ MaxStreamingBitrate: 20_000_000 })
        }));
        await manager.stop(player);
    });
});

describe('playback start and failure lifecycle', () => {
    it('does not start or advance the queue when initial play rejects', async () => {
        const { play, manager, player } = setup();
        player.play.mockRejectedValue(new DOMException('unsupported', 'NotSupportedError'));
        const started = vi.fn();
        Events.on(manager, 'playbackstart', started);
        const result = await play();
        await vi.advanceTimersByTimeAsync(100);
        expect(result).toBe(false);
        expect(started).not.toHaveBeenCalled();
        expect(mocks.apiClient.reportPlaybackStart).not.toHaveBeenCalled();
        expect(mocks.apiClient.reportPlaybackStopped).toHaveBeenCalledTimes(1);
        expect(manager.getCurrentPlaylistIndex(player)).toBe(-1);
        expect(player.destroy).toHaveBeenCalledTimes(1);
        expect(mocks.loading.hide).toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps a rejected fallback on the failed-start path', async () => {
        const { play, manager, player } = setup();
        mocks.getPostedPlaybackInfo.mockResolvedValueOnce({ data: { MediaSources: [{ ...source(), SupportsTranscoding: true }] } })
            .mockResolvedValueOnce({ data: { MediaSources: [{ ...source(true), SupportsTranscoding: true }] } });
        player.play.mockRejectedValue(new DOMException('unsupported', 'NotSupportedError'));
        const result = await play();
        await vi.advanceTimersByTimeAsync(100);
        expect(result).toBe(false);
        expect(player.play).toHaveBeenCalledTimes(2);
        expect(mocks.apiClient.reportPlaybackStart).not.toHaveBeenCalled();
        expect(mocks.apiClient.reportPlaybackStopped).toHaveBeenCalledTimes(1);
        expect(manager.getCurrentPlaylistIndex(player)).toBe(-1);
        expect(mocks.loading.hide).toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('reports one genuine start when fallback succeeds', async () => {
        const { play, manager, player } = setup();
        mocks.getPostedPlaybackInfo.mockResolvedValueOnce({ data: { MediaSources: [{ ...source(), SupportsTranscoding: true }] } })
            .mockResolvedValueOnce({ data: { MediaSources: [source(true)] } });
        player.play.mockRejectedValueOnce(new DOMException('unsupported', 'NotSupportedError'));
        const result = await play();
        await vi.advanceTimersByTimeAsync(100);
        expect(result).toBe(true);
        expect(player.play).toHaveBeenCalledTimes(2);
        expect(mocks.apiClient.reportPlaybackStart).toHaveBeenCalledTimes(1);
        expect(mocks.apiClient.reportPlaybackStopped).not.toHaveBeenCalled();
        expect(manager.getCurrentPlaylistIndex(player)).toBe(0);
        expect(mocks.loading.hide).toHaveBeenCalled();
        await manager.stop(player);
        expect(mocks.apiClient.reportPlaybackStopped).toHaveBeenCalledTimes(1);
    });

    it.each(['resolve', 'reject'])('ignores a pending play that later %ss after cancellation', async outcome => {
        const { play, manager, player } = setup();
        let resolve!: () => void;
        let reject!: (error: Error) => void;
        player.play.mockImplementation(() => new Promise<void>((done, fail) => {
            resolve = done;
            reject = fail;
        }));
        const playing = play();
        await vi.waitFor(() => expect(player.play).toHaveBeenCalledOnce());
        await manager.stop(player);
        if (outcome === 'resolve') resolve();
        else reject(new Error('cancelled'));
        expect(await playing).toBe(false);
        await vi.advanceTimersByTimeAsync(100);
        expect(mocks.apiClient.reportPlaybackStart).not.toHaveBeenCalled();
        expect(mocks.apiClient.reportPlaybackStopped).toHaveBeenCalledTimes(1);
        expect(manager.getCurrentPlaylistIndex(player)).toBe(-1);
        expect(mocks.loading.hide).toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('reports one stop after a genuine start and never advances on error', async () => {
        const { play, manager, player } = setup();
        expect(await play()).toBe(true);
        expect(manager.getCurrentPlaylistIndex(player)).toBe(0);
        Events.trigger(player, 'error', [{ type: MediaError.PLAYER_ERROR }]);
        expect(mocks.apiClient.reportPlaybackStart).toHaveBeenCalledTimes(1);
        expect(mocks.apiClient.reportPlaybackStopped).toHaveBeenCalledTimes(1);
        expect(manager.getCurrentPlaylistIndex(player)).toBe(-1);
        expect(mocks.loading.hide).toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('handles a rejected fallback request without starting playback', async () => {
        const { play, manager, player } = setup();
        mocks.getPostedPlaybackInfo.mockResolvedValueOnce({ data: { MediaSources: [{ ...source(), SupportsTranscoding: true }] } })
            .mockRejectedValueOnce(new Error('offline'));
        player.play.mockRejectedValue(new DOMException('unsupported', 'NotSupportedError'));
        expect(await play()).toBe(false);
        expect(mocks.apiClient.reportPlaybackStart).not.toHaveBeenCalled();
        expect(mocks.apiClient.reportPlaybackStopped).toHaveBeenCalledTimes(1);
        expect(manager.getCurrentPlaylistIndex(player)).toBe(-1);
        expect(mocks.loading.hide).toHaveBeenCalled();
    });

    it('keeps encoding cleanup when the initial transcode fails and fallback succeeds', async () => {
        const { play, manager, player } = setup();
        mocks.getPostedPlaybackInfo.mockResolvedValueOnce({ data: { MediaSources: [{
            ...source(true), TranscodingUrl: 'video?playSessionId=session'
        }] } }).mockResolvedValueOnce({ data: { MediaSources: [source(true)] } });
        player.play.mockRejectedValueOnce(new DOMException('unsupported', 'NotSupportedError'));
        expect(await play()).toBe(true);
        expect(mocks.apiClient.stopActiveEncodings).toHaveBeenCalledTimes(2);
        expect(mocks.apiClient.reportPlaybackStart).toHaveBeenCalledTimes(1);
        await manager.stop(player);
    });

    it('cancels before fallback replaces the source', async () => {
        const { play, manager, player } = setup();
        let resolve!: () => void;
        mocks.getPostedPlaybackInfo.mockResolvedValueOnce({ data: { MediaSources: [{
            ...source(true), TranscodingUrl: 'video?playSessionId=session'
        }] } }).mockResolvedValueOnce({ data: { MediaSources: [source(true)] } });
        mocks.apiClient.stopActiveEncodings.mockReturnValueOnce(new Promise<void>(done => {
            resolve = done;
        }));
        player.play.mockRejectedValueOnce(new DOMException('unsupported', 'NotSupportedError'));
        const playing = play();
        await vi.waitFor(() => expect(mocks.apiClient.stopActiveEncodings).toHaveBeenCalledOnce());
        await manager.stop(player);
        resolve();
        expect(await playing).toBe(false);
        expect(player.play).toHaveBeenCalledTimes(1);
        expect(mocks.apiClient.reportPlaybackStart).not.toHaveBeenCalled();
        expect(mocks.apiClient.reportPlaybackStopped).toHaveBeenCalledTimes(1);
        expect(manager.getCurrentPlaylistIndex(player)).toBe(-1);
        expect(mocks.loading.hide).toHaveBeenCalled();
    });

    it('cancels a pending URL item without reporting a successful start', async () => {
        const { manager, player } = setup();
        let resolve!: () => void;
        player.play.mockImplementation(() => new Promise<void>(done => {
            resolve = done;
        }));
        const started = vi.fn();
        Events.on(manager, 'playbackstart', started);
        const playing = manager.play({ items: [{ Url: 'https://example/video.mp4', MediaType: 'Video' }] });
        await vi.waitFor(() => expect(player.play).toHaveBeenCalledOnce());
        await manager.stop(player);
        resolve();
        expect(await playing).toBe(false);
        expect(started).not.toHaveBeenCalled();
        expect(mocks.apiClient.reportPlaybackStart).not.toHaveBeenCalled();
        expect(mocks.apiClient.reportPlaybackStopped).not.toHaveBeenCalled();
        expect(manager.getCurrentPlaylistIndex(player)).toBe(-1);
        expect(mocks.loading.hide).toHaveBeenCalled();
    });
    it('retries an already started stream without reporting a second start', async () => {
        const { play, manager, player } = setup();
        mocks.getPostedPlaybackInfo.mockResolvedValueOnce({ data: { MediaSources: [{ ...source(), SupportsTranscoding: true }] } })
            .mockResolvedValueOnce({ data: { MediaSources: [source(true)] } });
        expect(await play()).toBe(true);
        Events.trigger(player, 'error', [{ type: MediaError.PLAYER_ERROR }]);
        await vi.waitFor(() => expect(player.play).toHaveBeenCalledTimes(2));
        expect(mocks.apiClient.reportPlaybackStart).toHaveBeenCalledTimes(1);
        expect(mocks.apiClient.reportPlaybackProgress).toHaveBeenCalledTimes(1);
        expect(mocks.apiClient.reportPlaybackStopped).not.toHaveBeenCalled();
        expect(manager.getCurrentPlaylistIndex(player)).toBe(0);
        await manager.stop(player);
        expect(mocks.apiClient.reportPlaybackStopped).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('fallback track selection and optional stream changes', () => {
    it('uses this item audio selection and subtitles off in the fallback request', async () => {
        const { manager, player } = setup();
        Object.assign(player, { audioStreamIndex: 9, subtitleStreamIndex: 7, secondarySubtitleStreamIndex: 8 });
        const selectedSource = {
            ...source(), SupportsTranscoding: true,
            DefaultAudioStreamIndex: 4, DefaultSubtitleStreamIndex: -1, DefaultSecondarySubtitleStreamIndex: -1
        };
        mocks.getPostedPlaybackInfo.mockResolvedValueOnce({ data: { MediaSources: [selectedSource] } })
            .mockResolvedValueOnce({ data: { MediaSources: [{ ...selectedSource, ...source(true) }] } });
        player.play.mockRejectedValueOnce(new DOMException('unsupported', 'NotSupportedError'));
        expect(await manager.play({ items: [{ ...item }], audioStreamIndex: 4, subtitleStreamIndex: -1 })).toBe(true);
        expect(mocks.getPostedPlaybackInfo).toHaveBeenNthCalledWith(2, expect.objectContaining({
            playbackInfoDto: expect.objectContaining({ EnableDirectPlay: false, AudioStreamIndex: 4, SubtitleStreamIndex: -1 })
        }));
        expect(manager.getAudioStreamIndex(player)).toBe(4);
        expect(manager.getSubtitleStreamIndex(player)).toBe(-1);
        expect(manager.getSecondarySubtitleStreamIndex(player)).toBe(-1);
        await manager.stop(player);
    });

    it('keeps playing when an audio-change request rejects', async () => {
        const { play, manager, player } = setup();
        Object.assign(player, { canSetAudioStreamIndex: () => false });
        await play();
        const streamInfo = player.streamInfo;
        mocks.getPostedPlaybackInfo.mockRejectedValueOnce(new Error('offline'));
        manager.setAudioStreamIndex(4, player);
        await vi.waitFor(() => expect(mocks.getPostedPlaybackInfo).toHaveBeenCalledTimes(2));
        await vi.advanceTimersByTimeAsync(0);
        expect(player.streamInfo).toBe(streamInfo);
        expect(player.isChangingStream).toBe(false);
        expect(manager.getCurrentPlayer()).toBe(player);
        expect(player.destroy).not.toHaveBeenCalled();
        expect(mocks.apiClient.reportPlaybackStopped).not.toHaveBeenCalled();
        expect(mocks.alert).not.toHaveBeenCalled();
        await manager.stop(player);
    });

    it('shows a subtitle-change ErrorCode without stopping the episode', async () => {
        const { play, manager, player } = setup();
        Object.assign(player, { setSubtitleStreamIndex: vi.fn() });
        mocks.getPostedPlaybackInfo.mockResolvedValueOnce({ data: { MediaSources: [{
            ...source(), MediaStreams: [{ Type: 'Subtitle', Index: 0, DeliveryMethod: 'Encode' }], DefaultSubtitleStreamIndex: -1
        }] } });
        await play();
        const streamInfo = player.streamInfo;
        mocks.getPostedPlaybackInfo.mockResolvedValueOnce({ data: { ErrorCode: 'NoCompatibleStream' } });
        manager.setSubtitleStreamIndex(0, player);
        await vi.waitFor(() => expect(mocks.getPostedPlaybackInfo).toHaveBeenCalledTimes(2));
        await vi.advanceTimersByTimeAsync(0);
        expect(mocks.alert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ text: 'PlaybackErrorNoCompatibleStream' }));
        expect(player.streamInfo).toBe(streamInfo);
        expect(player.isChangingStream).toBe(false);
        expect(manager.getCurrentPlayer()).toBe(player);
        expect(player.destroy).not.toHaveBeenCalled();
        expect(mocks.apiClient.reportPlaybackStopped).not.toHaveBeenCalled();
        await manager.stop(player);
    });

    it('stops a failed-start fallback when the server returns ErrorCode', async () => {
        const { play, manager, player } = setup();
        mocks.getPostedPlaybackInfo.mockResolvedValueOnce({ data: { MediaSources: [{ ...source(), SupportsTranscoding: true }] } })
            .mockResolvedValueOnce({ data: { ErrorCode: 'NoCompatibleStream' } });
        player.play.mockRejectedValueOnce(new DOMException('unsupported', 'NotSupportedError'));
        expect(await play()).toBe(false);
        expect(player.destroy).toHaveBeenCalledOnce();
        expect(mocks.apiClient.reportPlaybackStart).not.toHaveBeenCalled();
        expect(mocks.apiClient.reportPlaybackStopped).toHaveBeenCalledOnce();
        expect(manager.getCurrentPlaylistIndex(player)).toBe(-1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('stops an error fallback request failure even after a genuine start', async () => {
        const { play, manager, player } = setup();
        mocks.getPostedPlaybackInfo.mockResolvedValueOnce({ data: { MediaSources: [{ ...source(), SupportsTranscoding: true }] } });
        await play();
        mocks.getPostedPlaybackInfo.mockRejectedValueOnce(new Error('offline'));
        Events.trigger(player, 'error', [{ type: MediaError.PLAYER_ERROR }]);
        await vi.waitFor(() => expect(mocks.apiClient.reportPlaybackStopped).toHaveBeenCalledOnce());
        expect(player.destroy).toHaveBeenCalledOnce();
        expect(mocks.apiClient.reportPlaybackStart).toHaveBeenCalledOnce();
        expect(manager.getCurrentPlaylistIndex(player)).toBe(-1);
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('player millisecond and server tick boundaries', () => {
    it('seeks in milliseconds and reports the same position in ticks', async () => {
        const { play, manager, player } = setup();
        await play();
        const currentTime = vi.spyOn(player, 'currentTime').mockReturnValue(12_500);
        manager.seek(125_000_000, player);
        expect(currentTime).toHaveBeenCalledWith(12_500);
        expect(manager.getCurrentTicks(player)).toBe(125_000_000);
        await manager.stop(player);
    });
});

describe('deferred player initialization', () => {
    it('awaits player loading before preparing and starting immediate playback', async () => {
        const { manager, player } = setup();
        let finish!: () => void;
        vi.mocked(pluginManager.prepareForPlayback).mockImplementationOnce(() => new Promise<void>(resolve => {
            finish = resolve;
        }));
        const playing = manager.play({ items: [{ ...item }] });
        expect(player.getDeviceProfile).not.toHaveBeenCalled();
        expect(player.play).not.toHaveBeenCalled();
        finish();
        await playing;
        expect(player.play).toHaveBeenCalledOnce();
    });

    it('hides loading and reports a first-load failure, then permits a successful retry', async () => {
        const { manager, player } = setup();
        const error = new Error('player chunk failed');
        vi.mocked(pluginManager.prepareForPlayback).mockRejectedValueOnce(error);
        await expect(manager.play({ items: [{ ...item }] })).rejects.toBe(error);
        expect(mocks.loading.show).toHaveBeenCalled();
        expect(mocks.loading.hide).toHaveBeenCalled();
        expect(mocks.alert).toHaveBeenCalledExactlyOnceWith({
            text: 'ErrorPlayerNotFound', title: 'HeaderPlaybackError'
        });
        expect(player.play).not.toHaveBeenCalled();
        await manager.play({ items: [{ ...item }] });
        expect(player.play).toHaveBeenCalledOnce();
        expect(mocks.alert).toHaveBeenCalledOnce();
    });

    it('keeps denied playback behind required interceptors on first play', async () => {
        const { play, player } = setup();
        const intercept = vi.fn().mockRejectedValue(new Error('denied'));
        mocks.interceptors.push({ intercept });
        await play();
        expect(intercept).toHaveBeenCalledOnce();
        expect(player.play).not.toHaveBeenCalled();
    });
});

describe('playback facade composition', () => {
    it('reads controls services when a command runs', async () => {
        const { manager, play } = setup();
        await play();
        const services = { ...manager._services };
        const controls = createPlaybackControls(manager, services);
        services.getPlayerData = vi.fn(services.getPlayerData);
        controls.api.getAudioStreamIndex();
        expect(services.getPlayerData).toHaveBeenCalledWith(manager.getCurrentPlayer());
    });

    it('preserves the constructor and publishes each playback responsibility', () => {
        const { manager } = setup();
        expect(manager).toBeInstanceOf(PlaybackManager);
        expect(manager.constructor.name).toBe('PlaybackManager');
        for (const name of ['play', 'getPlayerState', 'getPlaybackInfo', 'getTargets', 'setActivePlayer', 'nextTrack', 'queue', 'setCurrentPlaylistItem', 'setBrightness', 'stop'] as const) {
            expect(manager[name]).toBeTypeOf('function');
        }
    });
});
