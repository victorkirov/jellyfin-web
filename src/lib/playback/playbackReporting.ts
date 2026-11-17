import type { PlaybackStartInfo } from '@jellyfin/sdk/lib/generated-client/models/playback-start-info';
import type { PlaybackStopInfo } from '@jellyfin/sdk/lib/generated-client/models/playback-stop-info';
import type { PlaybackProgressInfo } from '@jellyfin/sdk/lib/generated-client/models/playback-progress-info';

import { TICKS_PER_MILLISECOND } from 'constants/time';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import type { PlaybackPlayer } from 'types/plugin';
import Events from 'utils/events';

import { enableLocalPlaylistManagement } from './playerSelection';
import type { PlaybackItem, PlaybackMediaSource, PlaybackState } from './types';

type ReportingContext = {
    _currentPlayer?: PlaybackPlayer | null;
    _playQueueManager: { getPlaylist: () => PlaybackItem[] };
};

type ReportMethod = 'reportPlaybackStart' | 'reportPlaybackStopped' | 'reportPlaybackProgress';

export function getPlaylistSync(context: ReportingContext, player?: PlaybackPlayer | null) {
    const selectedPlayer = player || context._currentPlayer;
    if (selectedPlayer && !enableLocalPlaylistManagement(selectedPlayer)) {
        // A player managing its queue supplies both synchronous and async reads.
        return selectedPlayer.getPlaylistSync!();
    }
    return context._playQueueManager.getPlaylist();
}

export function addPlaylistToPlaybackReport(context: ReportingContext, info: PlaybackState['PlayState'], player: PlaybackPlayer, serverId: string) {
    info.NowPlayingQueue = getPlaylistSync(context, player).map(item => {
        const queueItem: { Id?: string | null; PlaylistItemId?: string | null; ServerId?: string | null } = {
            Id: item.Id,
            PlaylistItemId: item.PlaylistItemId
        };
        if (item.ServerId !== serverId) queueItem.ServerId = item.ServerId;
        return queueItem;
    });
}

export function reportPlayback(context: ReportingContext, state: PlaybackState, player: PlaybackPlayer, reportPlaylist: boolean | undefined, serverId: string | null | undefined, method: ReportMethod, progressEventName?: string) {
    if (!serverId) {
        Events.trigger(context, 'reportplayback', [false]);
        return;
    }
    const info = Object.assign({}, state.PlayState);
    info.ItemId = state.NowPlayingItem!.Id;
    if (progressEventName) info.EventName = progressEventName;
    if (reportPlaylist) addPlaylistToPlaybackReport(context, info, player, serverId);
    const apiClient = ServerConnections.getApiClient(serverId);
    // Legacy plugin enum strings are serialized unchanged at the API boundary.
    const payload = info as PlaybackStartInfo & PlaybackStopInfo & PlaybackProgressInfo;
    void apiClient![method](payload).then(() => {
        Events.trigger(context, 'reportplayback', [true]);
    });
}

export function getNowPlayingItemForReporting(player: PlaybackPlayer, item: PlaybackItem, mediaSource?: PlaybackMediaSource | null) {
    const nowPlayingItem = Object.assign({}, item);
    if (mediaSource) {
        nowPlayingItem.RunTimeTicks = mediaSource.RunTimeTicks;
        nowPlayingItem.MediaStreams = mediaSource.MediaStreams;
        nowPlayingItem.MediaSources = null;
    }
    nowPlayingItem.RunTimeTicks = nowPlayingItem.RunTimeTicks || player.duration() * TICKS_PER_MILLISECOND;
    return nowPlayingItem;
}
