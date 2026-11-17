import { MediaType } from '@jellyfin/sdk/lib/generated-client/models/media-type';
import { TICKS_PER_MILLISECOND } from 'constants/time';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { reportPlayback } from 'lib/playback/playbackReporting';
import { enableLocalPlaylistManagement } from 'lib/playback/playerSelection';
import type { PlaybackFailure, PlaybackItem, PlaybackMediaSource, PlaybackOptions, PlaybackState, PlaybackStopState, PlaybackStreamInfo } from 'lib/playback/types';
import type { PlaybackPlayer } from 'types/plugin';
import Events from '../../utils/events';
import loading from '../loading/loading';
import type { PlaybackContext, PlaybackServices } from './playbackContext';
import { isServerItem } from './playbackItemQueries';
import { showPlaybackInfoErrorMessage } from './playbackNegotiation';
import { getPlayer } from './playbackRegistry';

export function createPlaybackLifecycle(self: PlaybackContext, services: Pick<PlaybackServices, 'setCurrentPlayerInternal' | 'getPlayerData' | 'getDefaultPlayOptions' | 'destroyPlayer' | 'removeCurrentPlayer' | 'getCurrentTicks' | 'changeStream'>) {
    function onPlayerProgressInterval(this: PlaybackPlayer) {
        sendProgressUpdate(this, 'timeupdate');
    }

    function startPlaybackProgressTimer(player: PlaybackPlayer) {
        stopPlaybackProgressTimer(player);

        player._progressInterval = setInterval(onPlayerProgressInterval.bind(player), 10000);
    }

    function stopPlaybackProgressTimer(player: PlaybackPlayer) {
        if (player._progressInterval) {
            clearInterval(player._progressInterval);
            player._progressInterval = null;
        }
    }

    function onPlaybackStarted(player: PlaybackPlayer, playOptions: PlaybackOptions, streamInfo: PlaybackStreamInfo, mediaSource?: PlaybackMediaSource) {
        if (!player) {
            throw new Error('player cannot be null');
        }

        if (self._currentPlayer !== player) services.setCurrentPlayerInternal(player);

        const playerData = services.getPlayerData(player);

        playerData.streamInfo = streamInfo;

        streamInfo.playbackStartTimeTicks = new Date().getTime() * TICKS_PER_MILLISECOND;

        if (mediaSource) {
            playerData.audioStreamIndex = mediaSource.DefaultAudioStreamIndex;
            playerData.subtitleStreamIndex = mediaSource.DefaultSubtitleStreamIndex;
            playerData.secondarySubtitleStreamIndex = mediaSource.DefaultSecondarySubtitleStreamIndex;
        } else {
            playerData.audioStreamIndex = null;
            playerData.subtitleStreamIndex = null;
            playerData.secondarySubtitleStreamIndex = null;
        }

        self._playNextAfterEnded = true;
        const isFirstItem = playOptions.isFirstItem;
        const fullscreen = playOptions.fullscreen;

        const state = self.getPlayerState(player, streamInfo.item, streamInfo.mediaSource);

        reportPlayback(self, state, player, true, state.NowPlayingItem!.ServerId, 'reportPlaybackStart');

        state.IsFirstItem = isFirstItem;
        state.IsFullscreen = fullscreen;
        Events.trigger(player, 'playbackstart', [state]);
        Events.trigger(self, 'playbackstart', [player, state]);

        // only used internally as a safeguard to avoid reporting other events to the server before playback start
        streamInfo.started = true;

        startPlaybackProgressTimer(player);
    }

    function onPlaybackStartedFromSelfManagingPlayer(this: PlaybackPlayer, e: unknown, item: PlaybackItem, mediaSource: PlaybackMediaSource) {
        services.setCurrentPlayerInternal(this);

        const playOptions = item.playOptions || services.getDefaultPlayOptions();
        const isFirstItem = playOptions.isFirstItem;
        const fullscreen = playOptions.fullscreen;

        playOptions.isFirstItem = false;

        const playerData = services.getPlayerData(this);
        playerData.streamInfo = {};

        const streamInfo = playerData.streamInfo;
        streamInfo.playbackStartTimeTicks = new Date().getTime() * TICKS_PER_MILLISECOND;

        const state = self.getPlayerState(this, item, mediaSource);

        reportPlayback(self, state, this, true, state.NowPlayingItem!.ServerId, 'reportPlaybackStart');

        state.IsFirstItem = isFirstItem;
        state.IsFullscreen = fullscreen;
        Events.trigger(this, 'playbackstart', [state]);
        Events.trigger(self, 'playbackstart', [this, state]);

        // only used internally as a safeguard to avoid reporting other events to the server before playback start
        streamInfo.started = true;

        startPlaybackProgressTimer(this);
    }

    function onPlaybackStoppedFromSelfManagingPlayer(this: PlaybackPlayer, e: unknown, playerStopInfo: PlaybackStopState) {
        stopPlaybackProgressTimer(this);
        const state = self.getPlayerState(this, playerStopInfo.item, playerStopInfo.mediaSource);

        const nextItem = playerStopInfo.nextItem;
        const nextMediaType = playerStopInfo.nextMediaType;

        const playbackStopInfo = {
            player: this,
            state: state,
            nextItem: (nextItem ? nextItem.item : null),
            nextMediaType: nextMediaType
        };

        state.NextMediaType = nextMediaType;

        const streamInfo = services.getPlayerData(this).streamInfo;

        // only used internally as a safeguard to avoid reporting other events to the server after playback stopped
        streamInfo!.ended = true;

        if (isServerItem(playerStopInfo.item)) {
            state.PlayState.PositionTicks = (playerStopInfo.positionMs || 0) * TICKS_PER_MILLISECOND;

            reportPlayback(self, state, this, true, playerStopInfo.item.ServerId, 'reportPlaybackStopped');
        }

        state.NextItem = playbackStopInfo.nextItem;

        Events.trigger(this, 'playbackstop', [state]);
        Events.trigger(self, 'playbackstop', [playbackStopInfo]);

        const nextItemPlayOptions = nextItem ? (nextItem.item.playOptions || services.getDefaultPlayOptions()) : services.getDefaultPlayOptions();
        const newPlayer = nextItem ? getPlayer(self, nextItem.item, nextItemPlayOptions) : null;

        if (newPlayer !== this) {
            services.destroyPlayer(this);
            services.removeCurrentPlayer(this);
        }
    }

    /**
         * @param {object} streamInfo
         * @param {MediaError} errorType
         * @param {boolean} currentlyPreventsVideoStreamCopy
         * @param {boolean} currentlyPreventsAudioStreamCopy
         * @returns {boolean} Returns true if the stream should be retried by transcoding.
         */
    function enablePlaybackRetryWithTranscoding(streamInfo: PlaybackStreamInfo, errorType: string | number | undefined, currentlyPreventsVideoStreamCopy: boolean, currentlyPreventsAudioStreamCopy: boolean) {
        return streamInfo.mediaSource!.SupportsTranscoding
                && (!currentlyPreventsVideoStreamCopy || !currentlyPreventsAudioStreamCopy);
    }

    /**
         * Playback error handler.
         * @param {Error} e
         * @param {object} error
         * @param {object} error.streamInfo
         * @param {MediaError} error.type
         */
    /** @returns False after terminal failure, or the existing fallback negotiation result. */ function onPlaybackError(this: PlaybackPlayer, e: unknown, error?: PlaybackFailure): Promise<boolean | void> | boolean | void {
        error = error || {};

        const errorType = error.type;

        console.warn('[playbackmanager] onPlaybackError:', e, error);

        const streamInfo = error.streamInfo || services.getPlayerData(this).streamInfo;

        if (streamInfo?.url) {
            const isAlreadyFallbacking = streamInfo.url.toLowerCase().includes('transcodereasons');
            const currentlyPreventsVideoStreamCopy = streamInfo.url.toLowerCase().indexOf('allowvideostreamcopy=false') !== -1;
            const currentlyPreventsAudioStreamCopy = streamInfo.url.toLowerCase().indexOf('allowaudiostreamcopy=false') !== -1;

            // Auto switch to transcoding
            if (enablePlaybackRetryWithTranscoding(streamInfo, errorType, currentlyPreventsVideoStreamCopy, currentlyPreventsAudioStreamCopy)) {
                const startTime = services.getCurrentTicks(this) || streamInfo.playerStartPositionTicks;
                const isRemoteSource = streamInfo.item!.LocationType === 'Remote';
                // force transcoding and only allow remuxing for remote source like liveTV, but only for initial trial
                const tryVideoStreamCopy = isRemoteSource && !isAlreadyFallbacking;

                return services.changeStream(this, startTime!, {
                    EnableDirectPlay: false,
                    EnableDirectStream: tryVideoStreamCopy,
                    AllowVideoStreamCopy: tryVideoStreamCopy,
                    AllowAudioStreamCopy: currentlyPreventsAudioStreamCopy || currentlyPreventsVideoStreamCopy ? false : null
                });
            }
        }

        Events.trigger(self, 'playbackerror', [errorType]);

        onPlaybackStopped.call(this, e, `.${errorType}`);
        return false;
    }

    function reportStoppedState(player: PlaybackPlayer, state: PlaybackState, streamInfo: PlaybackStreamInfo | null | undefined) {
        if (streamInfo && isServerItem(streamInfo.item!)) {
            if (player.supportsProgress === false && state.PlayState && !state.PlayState.PositionTicks) {
                state.PlayState.PositionTicks = streamInfo.item!.RunTimeTicks;
            }

            // only used internally as a safeguard to avoid reporting other events to the server after playback stopped
            streamInfo.ended = true;

            // Stop reports release server streams even when an attempt never started.
            reportPlayback(self, state, player, true, streamInfo.item!.ServerId, 'reportPlaybackStopped');
        }
    }

    function onPlaybackStopped(this: PlaybackPlayer, e?: unknown, displayErrorCode?: string) {
        if (services.getPlayerData(this).isChangingStream || !services.getPlayerData(this).streamInfo) {
            return;
        }

        loading.hide();
        stopPlaybackProgressTimer(this);

        // User clicked stop or content ended
        const state = self.getPlayerState(this);
        const data = services.getPlayerData(this);
        const streamInfo = data.streamInfo;

        const errorOccurred = displayErrorCode && typeof (displayErrorCode) === 'string';

        const nextItem = self._playNextAfterEnded && !errorOccurred ? self._playQueueManager.getNextItemInfo() : null;

        const nextMediaType = (nextItem ? nextItem.item.MediaType : null);

        const playbackStopInfo = {
            player: this,
            state: state,
            nextItem: (nextItem ? nextItem.item : null),
            nextMediaType: nextMediaType
        };

        state.NextMediaType = nextMediaType;

        reportStoppedState(this, state, streamInfo);

        state.NextItem = playbackStopInfo.nextItem;

        if (!nextItem) {
            self._playQueueManager.reset();
        }

        Events.trigger(this, 'playbackstop', [state]);
        Events.trigger(self, 'playbackstop', [playbackStopInfo]);

        const nextItemPlayOptions = nextItem ? (nextItem.item.playOptions || services.getDefaultPlayOptions()) : services.getDefaultPlayOptions();
        const newPlayer = nextItem ? getPlayer(self, nextItem.item, nextItemPlayOptions) : null;

        if (!newPlayer) {
            data.streamInfo = null;
            services.destroyPlayer(this);
            services.removeCurrentPlayer(this);
        }

        if (errorOccurred) {
            showPlaybackInfoErrorMessage(self, 'PlaybackError' + displayErrorCode);
        } else if (newPlayer) {
            const apiClient = ServerConnections.getApiClient(nextItem!.item.ServerId);

            void apiClient!.getCurrentUser().then((user) => {
                if (user.Configuration!.EnableNextEpisodeAutoPlay || nextMediaType !== MediaType.Video) {
                    self.nextTrack();

                    if (newPlayer !== this) {
                        Events.trigger(self, 'playbackstop', [{
                            player: this,
                            state,
                            nextItem,
                            nextMediaType
                        }]);
                    }
                }
            });
        }
    }

    function onPlaybackChanging(activePlayer: PlaybackPlayer, newPlayer: PlaybackPlayer | null | undefined, newItem: PlaybackItem) {
        const state = self.getPlayerState(activePlayer);

        const serverId = self.currentItem(activePlayer)!.ServerId;

        // User started playing something new while existing content is playing
        let promise;

        stopPlaybackProgressTimer(activePlayer);
        unbindStopped(activePlayer);

        if (activePlayer === newPlayer) {
            // If we're staying with the same player, stop it
            promise = activePlayer.stop(false);
        } else {
            // If we're switching players, tear down the current one
            promise = activePlayer.stop(true);
        }

        return promise.then(function () {
            // Clear the data since we were not listening 'stopped'
            services.getPlayerData(activePlayer).streamInfo = null;

            bindStopped(activePlayer);

            if (enableLocalPlaylistManagement(activePlayer)) {
                reportPlayback(self, state, activePlayer, true, serverId, 'reportPlaybackStopped');
            }

            Events.trigger(self, 'playbackstop', [{
                player: activePlayer,
                state: state,
                nextItem: newItem,
                nextMediaType: newItem.MediaType
            }]);
        });
    }

    function bindStopped(player: PlaybackPlayer) {
        if (enableLocalPlaylistManagement(player)) {
            Events.off(player, 'stopped', onPlaybackStopped);
            Events.on(player, 'stopped', onPlaybackStopped);
        }
    }

    function onPlaybackTimeUpdate(this: PlaybackPlayer) {
        sendProgressUpdate(this, 'timeupdate');
    }

    function onPlaybackPause(this: PlaybackPlayer) {
        sendProgressUpdate(this, 'pause');
    }

    function onPlaybackUnpause(this: PlaybackPlayer) {
        sendProgressUpdate(this, 'unpause');
    }

    function onPlaybackVolumeChange(this: PlaybackPlayer) {
        sendProgressUpdate(this, 'volumechange');
    }

    function onRepeatModeChange(this: PlaybackPlayer) {
        sendProgressUpdate(this, 'repeatmodechange');
    }

    function onShuffleQueueModeChange(this: PlaybackPlayer) {
        sendProgressUpdate(this, 'shufflequeuemodechange');
    }

    function onPlaylistItemMove(this: PlaybackPlayer) {
        sendProgressUpdate(this, 'playlistitemmove', true);
    }

    function onPlaylistItemRemove(this: PlaybackPlayer) {
        sendProgressUpdate(this, 'playlistitemremove', true);
    }

    function onPlaylistItemAdd(this: PlaybackPlayer) {
        sendProgressUpdate(this, 'playlistitemadd', true);
    }

    function unbindStopped(player: PlaybackPlayer) {
        Events.off(player, 'stopped', onPlaybackStopped);
    }

    function sendProgressUpdate(player: PlaybackPlayer, progressEventName?: string, reportPlaylist?: boolean) {
        if (!player) {
            throw new Error('player cannot be null');
        }

        const state = self.getPlayerState(player);

        if (state.NowPlayingItem) {
            const serverId = state.NowPlayingItem.ServerId;

            const streamInfo = services.getPlayerData(player).streamInfo;

            if (streamInfo?.started && !streamInfo.ended) {
                reportPlayback(self, state, player, reportPlaylist, serverId, 'reportPlaybackProgress', progressEventName);
            }

            if (streamInfo?.liveStreamId
                    && (new Date().getTime() - (streamInfo.lastMediaInfoQuery || 0) >= 600000)
            ) {
                getLiveStreamMediaInfo(player, streamInfo, self.currentMediaSource(player)!, streamInfo.liveStreamId, serverId!);
            }
        }
    }

    function getLiveStreamMediaInfo(player: PlaybackPlayer, streamInfo: PlaybackStreamInfo, mediaSource: PlaybackMediaSource, liveStreamId: string | null | undefined, serverId: string) {
        console.debug('getLiveStreamMediaInfo');

        streamInfo.lastMediaInfoQuery = new Date().getTime();

        ServerConnections.getApiClient(serverId)!.getLiveStreamMediaInfo(liveStreamId!).then(function (info) {
            mediaSource.MediaStreams = info.MediaStreams;
            Events.trigger(player, 'mediastreamschange');
        }, function () {
            // Swallow errors
        });
    }

    const api = {
        onAppClose: function (this: PlaybackContext) {
            const player = this._currentPlayer;

            // Try to report playback stopped before the app closes
            if (player && this.isPlaying(player)) {
                self._playNextAfterEnded = false;
                onPlaybackStopped.call(player);
            }
        }
    };
    return {

        services: { onPlaybackStarted, onPlaybackStartedFromSelfManagingPlayer, onPlaybackStoppedFromSelfManagingPlayer, onPlaybackError, onPlaybackStopped, onPlaybackChanging, bindStopped, onPlaybackTimeUpdate, onPlaybackPause, onPlaybackUnpause, onPlaybackVolumeChange, onRepeatModeChange, onShuffleQueueModeChange, onPlaylistItemMove, onPlaylistItemRemove, onPlaylistItemAdd, sendProgressUpdate },
        api
    };
}
