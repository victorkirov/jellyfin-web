import { MediaSegmentType } from '@jellyfin/sdk/lib/generated-client/models/media-segment-type';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaybackManager } from 'components/playback/playbackmanager';
import Events from 'utils/events';
import { bindMediaSegmentManager } from './mediaSegmentManager';

const { getItemSegments } = vi.hoisted(() => ({ getItemSegments: vi.fn() }));
vi.mock('@jellyfin/sdk/lib/utils/api/media-segment-api', () => ({ getMediaSegmentApi: () => ({ getItemSegments }) }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApi: () => ({}) } }));
vi.mock('scripts/settings/userSettings', () => ({ currentSettings: { get: () => 'Skip' } }));

const segment = (id: string) => ({ Id: id, Type: MediaSegmentType.Intro, StartTicks: 0, EndTicks: 100_000_000 });
const start = (player: object, id: string, hasSegments = true) => Events.trigger(player, 'playbackstart', [{
    MediaSource: { Id: id, HasSegments: hasSegments }, NowPlayingItem: { ServerId: 'server' }
}]);
const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

describe('active item media segments', () => {
    beforeEach(() => vi.clearAllMocks());

    function setup() {
        let player = {};
        const manager = {
            getCurrentPlayer: () => player,
            currentTime: () => 0,
            seek: vi.fn(), nextTrack: vi.fn(), promptToSkip: vi.fn()
        };
        bindMediaSegmentManager(manager as unknown as PlaybackManager);
        return { manager, player, changePlayer: () => {
            player = {};
            Events.trigger(manager, 'playerchange');
            return player;
        } };
    }

    it('ignores A resolving after B and uses B on timeupdate', async () => {
        const { manager, player } = setup();
        let resolveA!: (data: unknown) => void;
        getItemSegments.mockReturnValueOnce(new Promise(resolve => {
            resolveA = resolve;
        }))
            .mockResolvedValueOnce({ data: { Items: [segment('B')] } });
        start(player, 'A');
        start(player, 'B');
        await flush();
        resolveA({ data: { Items: [{ ...segment('A'), EndTicks: 200_000_000 }] } });
        await flush();
        Events.trigger(player, 'timeupdate');
        expect(manager.seek).toHaveBeenCalledExactlyOnceWith(100_000_000, player);
    });

    it.each(['stopped', 'playbackstop', 'playerchange', 'playbackcancelled'])('invalidates pending segments on %s', async event => {
        const { manager, player, changePlayer } = setup();
        let resolve!: (data: unknown) => void;
        getItemSegments.mockReturnValue(new Promise(done => {
            resolve = done;
        }));
        start(player, 'A');
        const activePlayer = event === 'playerchange' ? changePlayer() : player;
        if (event !== 'playerchange') Events.trigger(event === 'playbackcancelled' ? manager : player, event);
        resolve({ data: { Items: [segment('A')] } });
        await flush();
        Events.trigger(activePlayer, 'timeupdate');
        expect(manager.seek).not.toHaveBeenCalled();
    });

    it('clears loaded segments while B loads and for an item without segments', async () => {
        const { manager, player } = setup();
        getItemSegments.mockResolvedValueOnce({ data: { Items: [segment('A')] } })
            .mockReturnValueOnce(new Promise(() => undefined));
        start(player, 'A');
        await flush();
        start(player, 'B');
        Events.trigger(player, 'timeupdate');
        expect(manager.seek).not.toHaveBeenCalled();
        start(player, 'C', false);
        Events.trigger(player, 'timeupdate');
        expect(manager.seek).not.toHaveBeenCalled();
        expect(getItemSegments).toHaveBeenCalledTimes(2);
    });
});
