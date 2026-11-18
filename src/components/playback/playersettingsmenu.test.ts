import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaybackPlayer } from 'types/plugin';
import { show } from './playersettingsmenu';
import { playbackManager } from './playbackmanager';
import actionsheet from '../actionSheet/actionSheet';

vi.mock('../actionSheet/actionSheet', () => ({ default: { show: vi.fn() } }));
vi.mock('./playbackmanager', () => ({ playbackManager: {
    currentItem: () => ({ ServerId: 'server' }),
    currentMediaSource: () => ({ MediaStreams: [], RunTimeTicks: 100 }),
    getSupportedCommands: () => ['SetMaxStreamingBitrate'],
    getMaxStreamingBitrate: () => 20_000_000,
    enableAutomaticBitrateDetection: () => false,
    getPlayerState: () => ({ PlayState: { PlayMethod: 'Transcode' } }),
    getRepeatMode: () => 'RepeatNone',
    setMaxStreamingBitrate: vi.fn()
} }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: {
    getApiClient: () => ({ getCurrentUser: () => Promise.resolve({ Policy: { EnableVideoPlaybackTranscoding: true } }) })
} }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('../qualityOptions', () => ({ default: { getVideoQualityOptions: () => [
    { name: '20 Mbps', bitrate: 20_000_000, selected: true },
    { name: '5 Mbps', bitrate: 5_000_000 }
] } }));

const player = { name: 'test' } as PlaybackPlayer;
beforeEach(() => vi.clearAllMocks());

describe('player quality menu', () => {
    it('loads eligibility, opens quality choices and retains the selected player', async () => {
        vi.mocked(actionsheet.show).mockResolvedValueOnce('quality').mockResolvedValueOnce('5000000');
        await show({ player, quality: true });
        expect(actionsheet.show).toHaveBeenNthCalledWith(1, expect.objectContaining({ items: [expect.objectContaining({ id: 'quality' })] }));
        expect(playbackManager.setMaxStreamingBitrate).toHaveBeenCalledExactlyOnceWith({ enableAutomaticBitrateDetection: false, maxBitrate: 5_000_000 }, player);
    });

    it('waits for bitrate completion through both action sheets', async () => {
        vi.mocked(actionsheet.show).mockResolvedValueOnce('quality').mockResolvedValueOnce('5000000');
        let finish!: () => void;
        vi.mocked(playbackManager.setMaxStreamingBitrate).mockReturnValue(new Promise<void>(resolve => {
            finish = resolve;
        }));
        let settled = false;
        const operation = show({ player, quality: true }).then(() => {
            settled = true;
        });
        await vi.waitFor(() => expect(playbackManager.setMaxStreamingBitrate).toHaveBeenCalled());
        expect(settled).toBe(false);
        finish();
        await operation;
    });

    it('does not change the already selected bitrate', async () => {
        vi.mocked(actionsheet.show).mockResolvedValueOnce('quality').mockResolvedValueOnce('20000000');
        await show({ player, quality: true });
        expect(playbackManager.setMaxStreamingBitrate).not.toHaveBeenCalled();
    });
});
