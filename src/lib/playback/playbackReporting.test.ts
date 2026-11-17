import { describe, expect, it, vi } from 'vitest';

import type { PlaybackPlayer } from 'types/plugin';
import Events from 'utils/events';

import { addPlaylistToPlaybackReport, getNowPlayingItemForReporting, getPlaylistSync, reportPlayback } from './playbackReporting';
import type { PlaybackState } from './types';

const report = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: () => ({ reportPlaybackStart: report }) } }));

function player(): PlaybackPlayer {
    return {
        id: 'local', name: 'local', isLocalPlayer: true,
        supports: () => false, canPlayMediaType: () => true,
        getDeviceProfile: () => Promise.resolve({}), play: () => Promise.resolve(),
        stop: () => Promise.resolve(), destroy: () => undefined,
        duration: () => 12_500, currentTime: () => 0, paused: () => false,
        isMuted: () => false, getVolume: () => 100, setVolume: () => undefined
    };
}

describe('playback reporting extraction', () => {
    it('reads the local queue or the selected player-owned queue', () => {
        const localItems = [{ Id: 'local-item' }];
        const remoteItems = [{ Id: 'remote-item' }];
        const selected = player();
        const context = { _currentPlayer: selected, _playQueueManager: { getPlaylist: () => localItems } };
        expect(getPlaylistSync(context)).toBe(localItems);
        selected.getPlaylist = () => Promise.resolve(remoteItems);
        selected.getPlaylistSync = () => remoteItems;
        expect(getPlaylistSync(context)).toBe(remoteItems);
    });

    it('reports only queue identity, including the server for cross-server entries', () => {
        const context = { _playQueueManager: { getPlaylist: () => [
            { Id: 'one', PlaylistItemId: 'queue-one', ServerId: 'server', Name: 'omitted' },
            { Id: 'two', PlaylistItemId: 'queue-two', ServerId: 'other' }
        ] } };
        const info: PlaybackState['PlayState'] = {};
        addPlaylistToPlaybackReport(context, info, player(), 'server');
        expect(info.NowPlayingQueue).toEqual([
            { Id: 'one', PlaylistItemId: 'queue-one' },
            { Id: 'two', PlaylistItemId: 'queue-two', ServerId: 'other' }
        ]);
    });

    it('projects source duration and streams without mutating the queue item', () => {
        const item = { Id: 'item', MediaSources: [{ Id: 'version' }], RunTimeTicks: 1 };
        const mediaSource = { Id: 'version', RunTimeTicks: 250_000_000, MediaStreams: [] };
        const result = getNowPlayingItemForReporting(player(), item, mediaSource);
        expect(result).toEqual({ ...item, RunTimeTicks: 250_000_000, MediaStreams: [], MediaSources: null });
        expect(item.MediaSources).toEqual([{ Id: 'version' }]);
        expect(getNowPlayingItemForReporting(player(), { Id: 'url' }).RunTimeTicks).toBe(125_000_000);
    });

    it('notifies subscribers only after the server accepts the report', async () => {
        let finish!: () => void;
        report.mockReturnValueOnce(new Promise<void>(resolve => {
            finish = resolve;
        }));
        const context = { _playQueueManager: { getPlaylist: () => [] } };
        const sent = vi.fn();
        Events.on(context, 'reportplayback', sent);
        const state = { NowPlayingItem: { Id: 'item' }, PlayState: { PositionTicks: 125_000_000 } };
        reportPlayback(context, state, player(), true, 'server', 'reportPlaybackStart', 'timeupdate');
        expect(sent).not.toHaveBeenCalled();
        expect(report).toHaveBeenLastCalledWith({ ItemId: 'item', PositionTicks: 125_000_000, EventName: 'timeupdate', NowPlayingQueue: [] });
        expect(state.PlayState).toEqual({ PositionTicks: 125_000_000 });
        finish();
        await Promise.resolve();
        expect(sent).toHaveBeenCalledWith(expect.anything(), true);
    });

    it('notifies subscribers when a URL item has no reportable server', () => {
        const context = { _playQueueManager: { getPlaylist: () => [] } };
        const sent = vi.fn();
        Events.on(context, 'reportplayback', sent);
        reportPlayback(context, { PlayState: {} }, player(), false, undefined, 'reportPlaybackStart');
        expect(sent).toHaveBeenCalledWith(expect.anything(), false);
    });
});
