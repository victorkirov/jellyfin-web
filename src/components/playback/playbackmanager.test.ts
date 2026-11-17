import { startHlsPlayback } from './hlsPlayer';
import { onEndedInternal } from '../htmlMediaHelper';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackManager } from './playbackmanager';
import { createPlaybackControls } from './playbackControls';
import Events from '../../utils/events';
import { pluginManager } from '../pluginManager';
import { MediaError } from 'types/mediaError';
import type { PlaybackItem, PlaybackStreamInfo } from 'lib/playback/types';

const mocks = vi.hoisted(() => ({
    hlsAutoStart: true,
    hlsPlayers: [] as { destroy: ReturnType<typeof vi.fn>; loadSource: ReturnType<typeof vi.fn>; listeners: Map<string, () => void> }[],
    players: [] as object[],
    interceptors: [] as object[],
    alert: vi.fn(),
    getPostedPlaybackInfo: vi.fn(),
    detectBitrate: vi.fn(),
    localItem: vi.fn(() => false),
    automaticBitrate: vi.fn(() => false),
    cinemaMode: vi.fn(() => false),
    maxBitrate: vi.fn(() => 20_000_000),
    loading: { show: vi.fn(), hide: vi.fn() },
    apiClient: {
        getEndpointInfo: vi.fn(), getSavedEndpointInfo: () => ({}),
        getCurrentUser: vi.fn(), getCurrentUserId: () => 'user',
        ajax: vi.fn(), getNextUpEpisodes: vi.fn(), getEpisodes: vi.fn(), getIntros: vi.fn(), getAdditionalVideoParts: vi.fn(), getItem: vi.fn(), serverId: () => 'server',
        deviceId: () => 'tv', accessToken: () => 'test',
        getUrl: (path: string) => 'https://server/' + path,
        reportPlaybackStart: vi.fn(), reportPlaybackStopped: vi.fn(), reportPlaybackProgress: vi.fn(),
        stopActiveEncodings: vi.fn(), closeLiveStream: vi.fn()
    }
}));
vi.mock('scripts/settings/webSettings', () => ({ getIncludeCorsCredentials: () => Promise.resolve(false) }));
vi.mock('hls.js/dist/hls.js', () => ({ default: class {
    static readonly DefaultConfig = {};
    static readonly Events = { ['MANIFEST_PARSED']: 'manifest', ERROR: 'error' };
    listeners = new Map<string, () => void>();
    destroy = vi.fn();
    loadSource = vi.fn();
    constructor() { mocks.hlsPlayers.push(this); }
    on(event: string, listener: () => void) { this.listeners.set(event, listener); }
    attachMedia() { if (mocks.hlsAutoStart) this.listeners.get('manifest')!(); }
} }));
vi.mock('@jellyfin/sdk/lib/utils/api/media-info-api', () => ({ getMediaInfoApi: () => ({ getPostedPlaybackInfo: mocks.getPostedPlaybackInfo, closeLiveStream: mocks.apiClient.closeLiveStream }) }));
vi.mock('../pluginManager', () => ({ pluginManager: { prepareForPlayback: vi.fn().mockResolvedValue(undefined), canPlayDeferred: () => false, ofType: (type: string) => type === 'mediaplayer' ? mocks.players : mocks.interceptors } }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApi: () => ({}), getApiClient: () => mocks.apiClient, currentApiClient: () => mocks.apiClient } }));
vi.mock('../../scripts/settings/appSettings', () => ({ default: {
    enableAutomaticBitrateDetection: mocks.automaticBitrate, maxStreamingBitrate: mocks.maxBitrate,
    alwaysBurnInSubtitleWhenTranscoding: () => false
} }));
vi.mock('../itemHelper', () => ({ default: { isLocalItem: mocks.localItem } }));
vi.mock('../../scripts/settings/userSettings', () => ({ enableCinemaMode: mocks.cinemaMode, defaultPlayer: () => null }));
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
vi.mock('./brightnessosd', () => ({}));

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
    mocks.hlsPlayers.length = 0;
    mocks.hlsAutoStart = true;
    mocks.players.length = 0;
    mocks.interceptors.length = 0;
    mocks.localItem.mockReturnValue(false);
    mocks.automaticBitrate.mockReturnValue(false);
    mocks.cinemaMode.mockReturnValue(false);
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

const preparationStages = ['item', 'plugins', 'partsUser', 'parts', 'profile', 'user', 'source', 'negotiation', 'translation', 'translatedPlugins', 'intros', 'interceptor', 'bitrate', 'endpoint', 'version', 'nextUp', 'episodes', 'liveStream'];

function holdPreparation(stage: string, player: ReturnType<typeof setup>['player']) {
    let release!: (value: unknown) => void;
    let reject!: (error: Error) => void;
    let reached = false;
    const pending = new Promise<unknown>((resolve, fail) => {
        release = resolve;
        reject = fail;
    });
    const hold = () => {
        reached = true;
        return pending;
    };
    const preparedItem: PlaybackItem = { ...item, ChannelId: 'channel' };
    let value: unknown = { ...item };
    switch (stage) {
        case 'translation':
            preparedItem.Type = 'Program';
            mocks.apiClient.getItem.mockImplementationOnce(hold);
            break;
        case 'item':
        case 'source':
            mocks.apiClient.getItem.mockImplementationOnce(hold);
            break;
        case 'plugins':
            vi.mocked(pluginManager.prepareForPlayback).mockImplementationOnce(async () => {
                await hold();
            });
            value = undefined;
            break;
        case 'translatedPlugins':
            preparedItem.Type = 'Program';
            vi.mocked(pluginManager.prepareForPlayback).mockResolvedValueOnce(undefined).mockImplementationOnce(async () => {
                await hold();
            });
            value = undefined;
            break;
        case 'intros':
            mocks.cinemaMode.mockReturnValue(true);
            mocks.apiClient.getIntros.mockImplementationOnce(hold);
            value = { Items: [] };
            break;
        case 'interceptor':
            mocks.interceptors.push({ intercept: hold });
            value = undefined;
            break;
        case 'bitrate':
            mocks.automaticBitrate.mockReturnValue(true);
            mocks.detectBitrate.mockImplementationOnce(hold);
            value = 20_000_000;
            break;
        case 'partsUser':
            preparedItem.PartCount = 2;
            mocks.apiClient.getCurrentUser.mockImplementationOnce(hold);
            value = { Id: 'user', Configuration: {} };
            break;
        case 'user':
            mocks.apiClient.getCurrentUser.mockImplementationOnce(hold);
            value = { Id: 'user', Configuration: {} };
            break;
        case 'parts':
            preparedItem.PartCount = 2;
            mocks.apiClient.getAdditionalVideoParts.mockImplementationOnce(hold);
            value = { Items: [] };
            break;
        case 'profile':
            player.getDeviceProfile.mockImplementationOnce(hold);
            value = {};
            break;
        case 'endpoint':
            mocks.apiClient.getEndpointInfo.mockImplementationOnce(hold);
            value = {};
            break;
        case 'version':
            preparedItem.MediaSources = [source(), { ...source(), Id: 'version' }];
            mocks.apiClient.getItem.mockResolvedValueOnce(item).mockImplementationOnce(hold);
            mocks.getPostedPlaybackInfo.mockResolvedValueOnce({ data: { MediaSources: [{ ...source(), Id: 'version' }] } });
            value = { ...item, Id: 'version' };
            break;
        case 'nextUp':
            preparedItem.Type = 'Series';
            mocks.apiClient.getNextUpEpisodes.mockImplementationOnce(hold);
            value = { Items: [] };
            break;
        case 'episodes':
            preparedItem.Type = 'Series';
            mocks.apiClient.getNextUpEpisodes.mockResolvedValueOnce({ Items: [] });
            mocks.apiClient.getEpisodes.mockImplementationOnce(hold);
            value = { Items: [item] };
            break;
        case 'liveStream':
            mocks.getPostedPlaybackInfo.mockResolvedValueOnce({ data: { MediaSources: [{ ...source(), RequiresOpening: true }] } });
            mocks.apiClient.ajax.mockImplementationOnce(hold);
            value = { MediaSource: { ...source(), LiveStreamId: 'opened' } };
            break;
        case 'negotiation':
            mocks.getPostedPlaybackInfo.mockImplementationOnce(hold);
            value = { data: { MediaSources: [source()] } };
            break;
    }
    return { preparedItem, reached: () => reached, finish: (outcome: string) => {
        if (outcome === 'reject') reject(new Error('cancelled preparation'));
        else release(value);
    } };
}

describe('playback preparation ownership', () => {
    it('advances the queue after a genuine end', async () => {
        const { manager, player } = setup();
        mocks.apiClient.getCurrentUser.mockResolvedValue({ Id: 'user', Configuration: { EnableNextEpisodeAutoPlay: true } });
        expect(await manager.play({ items: [{ ...item }, { ...item, Id: 'second' }] })).toBe(true);
        Events.trigger(player, 'stopped');
        await vi.waitFor(() => expect(player.play).toHaveBeenCalledTimes(2));
        expect(manager.currentItem(player)?.Id).toBe('second');
        expect(manager.getCurrentPlaylistIndex(player)).toBe(1);
        expect(mocks.apiClient.reportPlaybackStart).toHaveBeenCalledTimes(2);
        await manager.stop(player);
    });

    it.each(preparationStages.flatMap(stage => ['resolve', 'reject'].map(outcome => ({ stage, outcome }))))('cancels while awaiting $stage ($outcome)', async ({ stage, outcome }) => {
        const { manager, player } = setup();
        const pending = holdPreparation(stage, player);
        const playing = manager.play(stage === 'item' ? { serverId: 'server', ids: ['item'] } : { items: [pending.preparedItem] });
        for (let index = 0; index < 40; index++) await Promise.resolve();
        expect(pending.reached()).toBe(true);
        expect(player.play).not.toHaveBeenCalled();
        await manager.stop();
        pending.finish(outcome);
        await playing;
        expect(player.play).not.toHaveBeenCalled();
        expect(mocks.apiClient.reportPlaybackStart).not.toHaveBeenCalled();
        expect(manager.getCurrentPlaylistIndex(player)).toBe(-1);
        expect(mocks.alert).not.toHaveBeenCalled();
        if (stage === 'liveStream' && outcome === 'resolve') expect(mocks.apiClient.closeLiveStream).toHaveBeenCalledWith({ liveStreamId: 'opened' });
    });

    it('does not report a pending player start after a newer play begins preparing', async () => {
        const { manager, player } = setup();
        let finishPlayer!: () => void;
        player.play.mockReturnValueOnce(new Promise<void>(resolve => {
            finishPlayer = resolve;
        }));
        const oldPlay = manager.play({ items: [{ ...item, Id: 'old' }] });
        await vi.waitFor(() => expect(player.play).toHaveBeenCalledOnce());
        const pending = holdPreparation('plugins', player);
        const newPlay = manager.play({ items: [{ ...item, Id: 'new' }] });
        expect(pending.reached()).toBe(true);
        finishPlayer();
        expect(await oldPlay).toBe(false);
        expect(mocks.apiClient.reportPlaybackStart).not.toHaveBeenCalled();
        pending.finish('resolve');
        expect(await newPlay).toBe(true);
        expect(mocks.apiClient.reportPlaybackStart).toHaveBeenCalledOnce();
        await manager.stop(player);
    });

    it('honors Stop from a player-change subscriber before calling the player', async () => {
        const { manager, player, play } = setup();
        Events.on(manager, 'playerchange', () => {
            if (manager.getCurrentPlayer()) void manager.stop();
        });
        expect(await play()).toBe(false);
        expect(player.play).not.toHaveBeenCalled();
        expect(mocks.apiClient.reportPlaybackStart).not.toHaveBeenCalled();
    });

    it('does not run another interceptor after cancellation', async () => {
        const { manager, player } = setup();
        const pending = holdPreparation('interceptor', player);
        const next = vi.fn().mockResolvedValue(undefined);
        mocks.interceptors.push({ intercept: next });
        const playing = manager.play({ items: [{ ...item }] });
        for (let index = 0; index < 40; index++) await Promise.resolve();
        expect(pending.reached()).toBe(true);
        await manager.stop();
        pending.finish('resolve');
        await playing;
        expect(next).not.toHaveBeenCalled();
        expect(player.play).not.toHaveBeenCalled();
    });

    it('leaves unrelated loading alone when Stop has no playback attempt', async () => {
        const { manager } = setup();
        await manager.stop();
        expect(mocks.loading.hide).not.toHaveBeenCalled();
    });

    it('releases loading ownership after playback finishes', async () => {
        const { manager, player, play } = setup();
        await play();
        await manager.stop(player);
        mocks.loading.hide.mockClear();
        await manager.stop();
        expect(mocks.loading.hide).not.toHaveBeenCalled();
    });

    it('leaves unrelated loading alone for a non-fullscreen attempt', async () => {
        const { manager, player } = setup();
        const pending = holdPreparation('plugins', player);
        const playing = manager.play({ items: [{ ...item }], fullscreen: false });
        await manager.stop();
        pending.finish('resolve');
        await playing;
        expect(mocks.loading.hide).not.toHaveBeenCalled();
    });

    it('keeps cleanup errors out of cancellation logs', async () => {
        const { manager, player } = setup();
        const pending = holdPreparation('liveStream', player);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        mocks.apiClient.closeLiveStream.mockRejectedValueOnce({ response: { status: 500 }, config: { headers: { Authorization: 'secret' } } });
        const playing = manager.play({ items: [{ ...item }] });
        for (let index = 0; index < 40; index++) await Promise.resolve();
        expect(pending.reached()).toBe(true);
        await manager.stop();
        pending.finish('resolve');
        expect(await playing).toBe(false);
        expect(player.play).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith('[playbackmanager] failed to close cancelled live stream', 500);
    });

    it.each([true, false])('finalizes owned loading when item preparation rejects, fullscreen=%s', async fullscreen => {
        const { manager, player } = setup();
        const error = new Error('item offline');
        mocks.apiClient.getItem.mockRejectedValueOnce(error);
        await expect(manager.play({ serverId: 'server', ids: ['item'], fullscreen })).rejects.toBe(error);
        if (fullscreen) expect(mocks.loading.hide).toHaveBeenCalled();
        else expect(mocks.loading.hide).not.toHaveBeenCalled();
        expect(player.play).not.toHaveBeenCalled();
    });

    it('ignores a stale preparation rejection after a newer playback starts', async () => {
        const { manager, player } = setup();
        let reject!: (error: Error) => void;
        player.getDeviceProfile.mockReturnValueOnce(new Promise((_resolve, fail) => {
            reject = fail;
        }));
        const oldPlay = manager.play({ items: [{ ...item, Id: 'old' }] });
        for (let index = 0; index < 40; index++) await Promise.resolve();
        expect(await manager.play({ items: [{ ...item, Id: 'new' }] })).toBe(true);
        const hideCalls = mocks.loading.hide.mock.calls.length;
        reject(new Error('old profile failed'));
        await oldPlay;
        expect(manager.currentItem(player)?.Id).toBe('new');
        expect(mocks.alert).not.toHaveBeenCalled();
        expect(mocks.loading.hide).toHaveBeenCalledTimes(hideCalls);
        expect(player.destroy).not.toHaveBeenCalled();
        await manager.stop(player);
    });

    it('keeps a superseding play when earlier preparation completes last', async () => {
        const { manager, player } = setup();
        let release!: () => void;
        vi.mocked(pluginManager.prepareForPlayback).mockReturnValueOnce(new Promise<void>(resolve => {
            release = resolve;
        }));
        const oldPlay = manager.play({ items: [{ ...item, Id: 'old' }] });
        expect(await manager.play({ items: [{ ...item, Id: 'new' }] })).toBe(true);
        release();
        await oldPlay;
        expect(player.play).toHaveBeenCalledOnce();
        expect(manager.currentItem(player)?.Id).toBe('new');
        await manager.stop(player);
    });
});

describe('brightness presentation events', () => {
    it('requests the overlay before changing player brightness', () => {
        const { manager, player } = setup();
        const order: string[] = [];
        const brightnessPlayer = Object.assign(player, { setBrightness: vi.fn(() => order.push('player')) });
        Events.on(manager, 'brightnessrequested', () => order.push('presentation'));
        manager.setBrightness(35, brightnessPlayer);
        expect(order).toEqual(['presentation', 'player']);
        expect(brightnessPlayer.setBrightness).toHaveBeenCalledWith(35);
    });
});

describe('reviewed preparation and stream-change Stop windows', () => {
    it.each(['play', 'nextTrack', 'setCurrentPlaylistItem', 'autoplay'].flatMap(command => [true, false].map(emitsStopped => ({ command, emitsStopped }))))('finishes Stop during $command replacement preparation, stopped event=$emitsStopped', async ({ command, emitsStopped }) => {
        const { manager, player } = setup();
        mocks.apiClient.getCurrentUser.mockResolvedValue({ Id: 'user', Configuration: { EnableNextEpisodeAutoPlay: true } });
        await manager.play({ items: [{ ...item }, { ...item, Id: 'second' }] });
        const playlist = await manager.getPlaylist(player);
        let release!: (value: object) => void;
        mocks.getPostedPlaybackInfo.mockReturnValueOnce(new Promise<object>(resolve => {
            release = resolve;
        }));
        let replacement: Promise<unknown> | undefined;
        if (command === 'play') replacement = manager.play({ items: [{ ...item, Id: 'replacement' }] });
        else if (command === 'nextTrack') manager.nextTrack(player);
        else if (command === 'setCurrentPlaylistItem') manager.setCurrentPlaylistItem(playlist[1].PlaylistItemId!, player);
        else Events.trigger(player, 'stopped');
        await vi.waitFor(() => expect(mocks.getPostedPlaybackInfo).toHaveBeenCalledTimes(2));
        expect(player.streamInfo).toBeNull();
        const reportsBeforeStop = mocks.apiClient.reportPlaybackStopped.mock.calls.length;
        mocks.loading.hide.mockClear();
        if (!emitsStopped) player.stop.mockImplementationOnce(() => Promise.resolve());
        await manager.stop();
        expect(mocks.loading.hide).toHaveBeenCalled();
        expect(manager.getCurrentPlayer()).toBeFalsy();
        expect(manager.isPlaying()).toBe(false);
        expect(manager.getCurrentPlaylistIndex(player)).toBe(-1);
        expect(mocks.apiClient.reportPlaybackStopped).toHaveBeenCalledTimes(reportsBeforeStop);
        release({ data: { MediaSources: [source()] } });
        await replacement;
        for (let index = 0; index < 40; index++) await Promise.resolve();
        expect(player.play).toHaveBeenCalledOnce();
        expect(manager.getCurrentPlayer()).toBeFalsy();
        expect(mocks.apiClient.reportPlaybackStart).toHaveBeenCalledOnce();
    });

    it.each(['resolve', 'reject'])('finishes Stop when a changed stream later %ss', async outcome => {
        const { manager, player, play } = setup();
        Object.assign(player, { canSetAudioStreamIndex: () => false });
        await play();
        let release!: () => void;
        let reject!: (error: Error) => void;
        player.play.mockReturnValueOnce(new Promise<void>((resolve, fail) => {
            release = resolve;
            reject = fail;
        }));
        const stopped = vi.fn();
        Events.on(manager, 'playbackstop', stopped);
        manager.setAudioStreamIndex(4, player);
        await vi.waitFor(() => expect(player.play).toHaveBeenCalledTimes(2));
        expect(player.isChangingStream).toBe(true);
        await manager.stop(player);
        if (outcome === 'resolve') release();
        else reject(new Error('cancelled stream change'));
        for (let index = 0; index < 40; index++) await Promise.resolve();
        expect(player.isChangingStream).toBe(false);
        expect(player.streamInfo).toBeNull();
        expect(manager.getCurrentPlayer()).toBeFalsy();
        expect(manager.isPlaying()).toBe(false);
        expect(mocks.apiClient.reportPlaybackStopped).toHaveBeenCalledOnce();
        expect(stopped).toHaveBeenCalledOnce();
        expect(mocks.apiClient.reportPlaybackStart).toHaveBeenCalledOnce();
    });

    it.each(['resolve', 'reject'])('settles an existing stream change when newer preparation supersedes its generation (%s)', async outcome => {
        const { manager, player, play } = setup();
        Object.assign(player, { canSetAudioStreamIndex: () => false });
        await play();
        let release!: () => void;
        let reject!: (error: Error) => void;
        player.play.mockReturnValueOnce(new Promise<void>((resolve, fail) => {
            release = resolve;
            reject = fail;
        }));
        manager.setAudioStreamIndex(4, player);
        await vi.waitFor(() => expect(player.play).toHaveBeenCalledTimes(2));
        const pending = holdPreparation('plugins', player);
        const replacing = manager.play({ items: [{ ...item, Id: 'replacement' }] });
        if (outcome === 'resolve') release();
        else reject(new Error('failed changed stream'));
        for (let index = 0; index < 40; index++) await Promise.resolve();
        expect(player.isChangingStream).toBe(false);
        await manager.stop(player);
        pending.finish('resolve');
        await replacing;
        expect(manager.getCurrentPlayer()).toBeFalsy();
        expect(mocks.apiClient.reportPlaybackStopped).toHaveBeenCalledOnce();
        expect(mocks.apiClient.reportPlaybackStart).toHaveBeenCalledOnce();
    });

    it('does not let an old player-stop completion clear newer playback', async () => {
        const { manager, player, play } = setup();
        await play();
        let finishOldStop!: () => void;
        player.stop.mockReturnValueOnce(new Promise<void>(resolve => {
            finishOldStop = resolve;
        }));
        const oldReplacement = manager.play({ items: [{ ...item, Id: 'old-replacement' }] });
        await vi.waitFor(() => expect(player.stop).toHaveBeenCalledOnce());
        await manager.stop();
        expect(await manager.play({ items: [{ ...item, Id: 'newest' }] })).toBe(true);
        const stopReports = mocks.apiClient.reportPlaybackStopped.mock.calls.length;
        finishOldStop();
        expect(await oldReplacement).toBe(false);
        expect(manager.currentItem(player)?.Id).toBe('newest');
        expect(manager.getCurrentPlayer()).toBe(player);
        expect(mocks.apiClient.reportPlaybackStopped).toHaveBeenCalledTimes(stopReports);
        Events.trigger(player, 'stopped');
        expect(manager.getCurrentPlayer()).toBeFalsy();
        expect(mocks.apiClient.reportPlaybackStopped).toHaveBeenCalledTimes(stopReports + 1);
    });

    it('closes an opened live source cancelled while alternate-version metadata is pending', async () => {
        const { manager, player } = setup();
        let release!: (value: object) => void;
        mocks.apiClient.getItem.mockResolvedValueOnce(item).mockReturnValueOnce(new Promise<object>(resolve => {
            release = resolve;
        }));
        mocks.getPostedPlaybackInfo.mockResolvedValueOnce({ data: { MediaSources: [{ ...source(), Id: 'alternate', RequiresOpening: true }] } });
        mocks.apiClient.ajax.mockResolvedValueOnce({ MediaSource: { ...source(), Id: 'alternate', LiveStreamId: 'opened' } });
        const playing = manager.play({ items: [{ ...item, MediaSources: [source(), { ...source(), Id: 'alternate' }] }] });
        await vi.waitFor(() => expect(mocks.apiClient.getItem).toHaveBeenCalledTimes(2));
        expect(mocks.apiClient.ajax).toHaveBeenCalledOnce();
        await manager.stop();
        release({ ...item, Id: 'alternate' });
        expect(await playing).toBe(false);
        expect(mocks.apiClient.closeLiveStream).toHaveBeenCalledOnce();
        expect(mocks.apiClient.closeLiveStream).toHaveBeenCalledWith({ liveStreamId: 'opened' });
        expect(mocks.apiClient.reportPlaybackStopped).not.toHaveBeenCalled();
        expect(player.play).not.toHaveBeenCalled();
    });

    it('closes a live source returned by cancelled playback negotiation', async () => {
        const { manager, player } = setup();
        let release!: (value: object) => void;
        mocks.getPostedPlaybackInfo.mockReturnValueOnce(new Promise<object>(resolve => {
            release = resolve;
        }));
        const playing = manager.play({ items: [{ ...item }] });
        await vi.waitFor(() => expect(mocks.getPostedPlaybackInfo).toHaveBeenCalledOnce());
        await manager.stop();
        release({ data: { MediaSources: [{ ...source(), LiveStreamId: 'automatic-open' }] } });
        expect(await playing).toBe(false);
        expect(mocks.apiClient.closeLiveStream).toHaveBeenCalledWith({ liveStreamId: 'automatic-open' });
        expect(player.play).not.toHaveBeenCalled();
    });

    it.each([true, false])('hands the live lease to playback lifecycle, fallback succeeds=%s', async succeeds => {
        const { manager, player } = setup();
        mocks.getPostedPlaybackInfo.mockResolvedValueOnce({ data: { MediaSources: [{ ...source(), RequiresOpening: true, SupportsTranscoding: true }] } })
            .mockResolvedValueOnce({ data: { MediaSources: [{ ...source(true), LiveStreamId: 'opened' }] } });
        mocks.apiClient.ajax.mockResolvedValueOnce({ MediaSource: { ...source(), SupportsTranscoding: true, LiveStreamId: 'opened' } });
        player.play.mockRejectedValueOnce(new DOMException('unsupported', 'NotSupportedError'));
        if (!succeeds) player.play.mockRejectedValueOnce(new DOMException('unsupported', 'NotSupportedError'));
        expect(await manager.play({ items: [{ ...item }] })).toBe(succeeds);
        expect(player.play).toHaveBeenCalledTimes(2);
        expect(mocks.apiClient.closeLiveStream).not.toHaveBeenCalled();
        expect(mocks.apiClient.reportPlaybackStart).toHaveBeenCalledTimes(succeeds ? 1 : 0);
        if (succeeds) await manager.stop(player);
        expect(mocks.apiClient.reportPlaybackStopped).toHaveBeenCalledOnce();
        expect(mocks.apiClient.closeLiveStream).not.toHaveBeenCalled();
    });

    it('releases a live source exactly once when Stop reenters from player change', async () => {
        const { manager, player } = setup();
        mocks.getPostedPlaybackInfo.mockResolvedValueOnce({ data: { MediaSources: [{ ...source(), RequiresOpening: true }] } });
        mocks.apiClient.ajax.mockResolvedValueOnce({ MediaSource: { ...source(), LiveStreamId: 'opened' } });
        Events.on(manager, 'playerchange', () => {
            if (manager.getCurrentPlayer()) void manager.stop(player);
        });
        expect(await manager.play({ items: [{ ...item }] })).toBe(false);
        const released = mocks.apiClient.closeLiveStream.mock.calls.length + mocks.apiClient.reportPlaybackStopped.mock.calls.length;
        expect(released).toBe(1);
        expect(player.play).not.toHaveBeenCalled();
        expect(manager.getCurrentPlayer()).toBeFalsy();
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

function setupHlsSession() {
    const context = setup();
    const { player } = context;
    const element = document.createElement('video');
    vi.spyOn(element, 'play').mockResolvedValue(undefined);
    const instance = Object.assign(player, { _mediaElement: element, _currentSrc: null as string | null });
    player.play.mockImplementation(async (stream: PlaybackStreamInfo) => {
        instance._currentSrc = stream.url || 'master.m3u8';
        await startHlsPlayback(instance, element, instance._currentSrc, vi.fn());
    });
    player.stop.mockImplementation(() => {
        onEndedInternal(instance, element, vi.fn());
        return Promise.resolve();
    });
    mocks.getPostedPlaybackInfo.mockResolvedValue({ data: { MediaSources: [{
        ...source(true), TranscodingSubProtocol: 'hls', TranscodingContainer: 'mp4', TranscodingUrl: 'master.m3u8?PlaySessionId=session'
    }] } });
    return { ...context, element };
}

describe('HLS sessions through playback manager stop and stream changes', () => {
    it('destroys the HLS session through manager Stop and releases playback state', async () => {
        const { manager, player, play } = setupHlsSession();
        await play();
        expect(mocks.hlsPlayers).toHaveLength(1);
        await manager.stop(player);
        expect(mocks.hlsPlayers[0].destroy).toHaveBeenCalledOnce();
        expect(manager.getCurrentPlayer()).toBeFalsy();
        expect(player.streamInfo).toBeNull();
    });
    it('replaces the HLS session when changing server audio streams', async () => {
        const { manager, player, play } = setupHlsSession();
        await play();
        manager.setAudioStreamIndex(4, player);
        await vi.waitFor(() => expect(mocks.hlsPlayers).toHaveLength(2));
        await vi.waitFor(() => expect(player.isChangingStream).toBe(false));
        expect(mocks.hlsPlayers[0].destroy).toHaveBeenCalledOnce();
        await manager.stop(player);
        expect(mocks.hlsPlayers[1].destroy).toHaveBeenCalledOnce();
    });
    it('cancels a changed stream awaiting its manifest and ignores its late callback', async () => {
        const { manager, player, play, element } = setupHlsSession();
        await play();
        mocks.hlsAutoStart = false;
        manager.setAudioStreamIndex(4, player);
        await vi.waitFor(() => expect(mocks.hlsPlayers).toHaveLength(2));
        await manager.stop(player);
        const playCount = vi.mocked(element.play).mock.calls.length;
        mocks.hlsPlayers[1].listeners.get('manifest')!();
        await vi.waitFor(() => expect(player.isChangingStream).toBe(false));
        expect(element.play).toHaveBeenCalledTimes(playCount);
        expect(mocks.hlsPlayers[1].destroy).toHaveBeenCalledOnce();
        expect(manager.getCurrentPlayer()).toBeFalsy();
    });
});
