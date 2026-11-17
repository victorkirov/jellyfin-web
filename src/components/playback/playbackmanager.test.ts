import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackManager } from './playbackmanager';
import Events from '../../utils/events';
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
vi.mock('../pluginManager', () => ({ pluginManager: { ofType: (type: string) => type === 'mediaplayer' ? mocks.players : mocks.interceptors } }));
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
vi.mock('apps/legacy/features/playback/utils/mediaSegmentManager', () => ({ bindMediaSegmentManager: vi.fn() }));
vi.mock('apps/legacy/features/playback/utils/mediaSessionSubscriber', () => ({ bindMediaSessionSubscriber: vi.fn() }));
vi.mock('./skipsegment.ts', () => ({ bindSkipSegment: vi.fn() }));

const item = { Id: 'item', ServerId: 'server', Type: 'Movie', MediaType: 'Video' };
const source = (transcode = false) => ({
    Id: 'item', MediaStreams: [], SupportsDirectStream: !transcode, SupportsTranscoding: false,
    TranscodingUrl: 'video?AllowVideoStreamCopy=false&AllowAudioStreamCopy=false&PlaySessionId=session',
    Container: 'mp4', RunTimeTicks: 600_000_000
});

function setup() {
    const player = {
        name: 'fake', id: 'fake', isLocalPlayer: true,
        getVolume: () => 100, setVolume: vi.fn(), canPlayMediaType: () => true,
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
