import type { MediaStream } from '@jellyfin/sdk/lib/generated-client/models/media-stream';
import { PlaybackOrder } from '@jellyfin/sdk/lib/generated-client/models/playback-order';
import { TICKS_PER_MILLISECOND } from 'constants/time';
import { PlayerEvent } from 'lib/playback/constants/playerEvent';
import { getNowPlayingItemForReporting } from 'lib/playback/playbackReporting';
import { enableLocalPlaylistManagement } from 'lib/playback/playerSelection';
import type { PlaybackItem, PlaybackMediaSource, PlaybackOptions, PlaybackState } from 'lib/playback/types';
import type { PlaybackPlayer } from 'types/plugin';
import datetime from '../../scripts/datetime';
import Events from '../../utils/events';
import { pluginManager } from '../pluginManager';
import type { PlaybackContext, PlaybackServices } from './playbackContext';
import { getItemsForPlayback } from './playbackItemQueries';
import { getPlayer } from './playbackRegistry';

export function createPlaybackState(self: PlaybackContext, services: Pick<PlaybackServices, 'getDeliveryMethod'>) {
    function getCurrentSubtitleStream(player: PlaybackPlayer, isSecondaryStream = false) {
        if (!player) {
            throw new Error('player cannot be null');
        }

        const index = isSecondaryStream ? getPlayerData(player).secondarySubtitleStreamIndex : getPlayerData(player).subtitleStreamIndex;

        if (index == null || index === -1) {
            return null;
        }

        return self.getSubtitleStream(player, index);
    }

    function getDefaultPlayOptions(): PlaybackOptions {
        return {
            fullscreen: true
        };
    }

    // Returns true if the player can seek using native client-side seeking functions
    /** @returns Native seekability, including the legacy duration value used as a truthy result. */ function canPlayerSeek(player: PlaybackPlayer | null | undefined) {
        if (!player) {
            throw new Error('player cannot be null');
        }

        const playerData = getPlayerData(player);

        const currentSrc = (playerData.streamInfo!.url || '').toLowerCase();

        if (currentSrc.indexOf('.m3u8') !== -1) {
            return true;
        }

        if (player.seekable) {
            return player.seekable();
        }

        const isPlayMethodTranscode = self.playMethod(player) === 'Transcode';

        if (isPlayMethodTranscode) {
            return false;
        }

        return player.duration();
    }

    function getPlayerData(player: PlaybackPlayer | null | undefined) {
        if (!player) {
            throw new Error('player cannot be null');
        }
        if (!player.name) {
            throw new Error('player name cannot be null');
        }
        return player;
    }

    const api = {
        currentItem: function (player?: PlaybackPlayer | null) {
            if (!player) {
                throw new Error('player cannot be null');
            }

            if (player.currentItem) {
                return player.currentItem();
            }

            const data = getPlayerData(player);
            return data.streamInfo ? data.streamInfo.item : null;
        },
        currentMediaSource: function (player?: PlaybackPlayer | null) {
            if (!player) {
                throw new Error('player cannot be null');
            }

            if (player.currentMediaSource) {
                return player.currentMediaSource();
            }

            const data = getPlayerData(player);
            return data.streamInfo ? data.streamInfo.mediaSource : null;
        },
        playMethod: function (player?: PlaybackPlayer | null) {
            if (!player) {
                throw new Error('player cannot be null');
            }

            if (player.playMethod) {
                return player.playMethod();
            }

            const data = getPlayerData(player);
            return data.streamInfo ? data.streamInfo.playMethod : null;
        },
        playSessionId: function (player?: PlaybackPlayer | null) {
            if (!player) {
                throw new Error('player cannot be null');
            }

            if (player.playSessionId) {
                return player.playSessionId();
            }

            const data = getPlayerData(player);
            return data.streamInfo ? data.streamInfo.playSessionId : null;
        },
        playerHasSecondarySubtitleSupport: function (player = self._currentPlayer) {
            if (!player) return false;
            return Boolean(player.supports('SecondarySubtitles'));
        },
        /**
                 * Checks if:
                 * - the track can be used directly as a secondary subtitle
                 * - or if it can be paired with a secondary subtitle when used as a primary subtitle
                 */
        trackHasSecondarySubtitleSupport: function (track: MediaStream, player = self._currentPlayer) {
            if (!player || !track) return false;
            const format = (track.Codec || '').toLowerCase();
            // Secondary subtitle pairing does not work with SSA/ASS combinations because
            // of the complexity of how they are rendered and the risk of the subtitles overlapping.
            // Graphical subtitle formats are supported generally, but not for secondary pairing here.
            return format !== 'ssa'
                        && format !== 'ass'
                        && format !== 'pgssub'
                        && format !== 'dvdsub'
                        && format !== 'vobsub'
                        && services.getDeliveryMethod(track) === 'External';
        },
        secondarySubtitleTracks: function (player = self._currentPlayer) {
            const streams = self.subtitleTracks(player);
            return streams.filter((stream) => self.trackHasSecondarySubtitleSupport(stream, player));
        },
        getSubtitleStream: function (player: PlaybackPlayer | null | undefined, index: number) {
            return self.subtitleTracks(player).filter(function (s) {
                return s.Type === 'Subtitle' && s.Index === index;
            })[0];
        },
        getPlaylist: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player && !enableLocalPlaylistManagement(player)) {
                if (player.getPlaylistSync) {
                    return Promise.resolve(player.getPlaylistSync());
                }

                return player.getPlaylist!();
            }

            return Promise.resolve(self._playQueueManager.getPlaylist());
        },
        promptToSkip: function (this: PlaybackContext, mediaSegment: object, player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;

            if (mediaSegment && this._skipSegment) {
                Events.trigger(player, PlayerEvent.PromptSkip, [mediaSegment]);
            }
        },
        isPlaying: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;

            if (player?.isPlaying) {
                return player.isPlaying();
            }

            return player?.currentSrc!() != null;
        },
        isPlayingMediaType: function (mediaType: string | null | undefined, player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;

            if (player?.isPlaying) {
                return player.isPlaying(mediaType);
            }

            if (self.isPlaying(player)) {
                const playerData = getPlayerData(player);

                return playerData.streamInfo!.mediaType === mediaType;
            }

            return false;
        },
        isPlayingLocally: function (mediaTypes: string[], player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;

            if (!player?.isLocalPlayer) {
                return false;
            }

            return mediaTypes.filter(function (mediaType: string | null | undefined) {
                return self.isPlayingMediaType(mediaType, player);
            }).length > 0;
        },
        isPlayingVideo: function (player?: PlaybackPlayer | null) {
            return self.isPlayingMediaType('Video', player);
        },
        isPlayingAudio: function (player?: PlaybackPlayer | null) {
            return self.isPlayingMediaType('Audio', player);
        },
        canPlay: function (item: PlaybackItem) {
            const itemType = item.Type;

            if (itemType === 'Book' || item.MediaType === 'Book') {
                return false;
            }

            if (itemType === 'PhotoAlbum' || itemType === 'MusicGenre' || itemType === 'Season' || itemType === 'Series' || itemType === 'BoxSet' || itemType === 'MusicAlbum' || itemType === 'MusicArtist' || itemType === 'Playlist') {
                return true;
            }

            if (item.LocationType === 'Virtual' && itemType !== 'Program') {
                return false;
            }

            if (itemType === 'Program') {
                if (!item.EndDate || !item.StartDate) {
                    return false;
                }

                if (new Date().getTime() > datetime.parseISO8601Date(item.EndDate).getTime() || new Date().getTime() < datetime.parseISO8601Date(item.StartDate).getTime()) {
                    return false;
                }
            }

            return getPlayer(self, item, getDefaultPlayOptions()) != null || pluginManager.canPlayDeferred(item);
        },
        getPlayerState: function (player?: PlaybackPlayer | null, item?: PlaybackItem | null, mediaSource?: PlaybackMediaSource | null) {
            player = (player || self._currentPlayer)!;

            if (!player) {
                throw new Error('player cannot be null');
            }

            if (!enableLocalPlaylistManagement(player) && player.getPlayerState) {
                return player.getPlayerState();
            }

            item = item || self.currentItem(player);
            mediaSource = mediaSource || self.currentMediaSource(player);

            const state: PlaybackState = {
                PlayState: {}
            };

            if (player) {
                state.PlayState.VolumeLevel = player.getVolume();
                state.PlayState.IsMuted = player.isMuted();
                state.PlayState.IsPaused = player.paused();
                state.PlayState.RepeatMode = self.getRepeatMode(player);
                state.PlayState.ShuffleMode = self.getQueueShuffleMode(player);
                // Needed for remote control because ShuffleMode doesn't exist in PlayerStateInfo from the server
                state.PlayState.PlaybackOrder = state.PlayState.ShuffleMode === 'Shuffle' ? PlaybackOrder.Shuffle : PlaybackOrder.Default;
                state.PlayState.MaxStreamingBitrate = self.getMaxStreamingBitrate(player);

                state.PlayState.PositionTicks = self.getCurrentTicks(player);
                state.PlayState.PlaybackStartTimeTicks = self.playbackStartTime(player);
                state.PlayState.PlaybackRate = self.getPlaybackRate(player);

                state.PlayState.SubtitleStreamIndex = self.getSubtitleStreamIndex(player);
                state.PlayState.SecondarySubtitleStreamIndex = self.getSecondarySubtitleStreamIndex(player);
                state.PlayState.AudioStreamIndex = self.getAudioStreamIndex(player);
                state.PlayState.BufferedRanges = self.getBufferedRanges(player);

                state.PlayState.PlayMethod = self.playMethod(player);

                if (mediaSource) {
                    state.PlayState.LiveStreamId = mediaSource.LiveStreamId;
                }
                state.PlayState.PlaySessionId = self.playSessionId(player);
                state.PlayState.PlaylistItemId = self.getCurrentPlaylistItemId(player);
            }

            if (mediaSource) {
                state.PlayState.MediaSourceId = mediaSource.Id;

                state.NowPlayingItem = {
                    RunTimeTicks: mediaSource.RunTimeTicks
                };

                state.PlayState.CanSeek = (mediaSource.RunTimeTicks || 0) > 0 || canPlayerSeek(player);
            }

            if (item) {
                state.NowPlayingItem = getNowPlayingItemForReporting(player, item, mediaSource);
            }

            state.MediaSource = mediaSource;

            return state;
        },
        duration: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;

            if (player && !enableLocalPlaylistManagement(player) && !player.isLocalPlayer) {
                return player.duration();
            }

            if (!player) {
                throw new Error('player cannot be null');
            }

            const mediaSource = self.currentMediaSource(player);

            if (mediaSource?.RunTimeTicks) {
                return mediaSource.RunTimeTicks;
            }

            let playerDuration = player.duration();

            if (playerDuration) {
                playerDuration *= TICKS_PER_MILLISECOND;
            }

            return playerDuration;
        },
        getCurrentTicks: function(player: PlaybackPlayer | null | undefined) {
            if (!player) {
                throw new Error('player cannot be null');
            }

            let playerTime = Math.floor(TICKS_PER_MILLISECOND * (player).currentTime());

            const streamInfo = getPlayerData(player).streamInfo;
            if (streamInfo) {
                playerTime += getPlayerData(player).streamInfo!.transcodingOffsetTicks || 0;
            }

            return playerTime;
        },
        playbackStartTime: function (this: PlaybackContext, player = this._currentPlayer) {
            if (player && !enableLocalPlaylistManagement(player) && !player.isLocalPlayer) {
                return player.playbackStartTime!();
            }

            const streamInfo = getPlayerData(player).streamInfo;
            return streamInfo ? streamInfo.playbackStartTimeTicks : null;
        },
        getItemsForPlayback
    };
    return {

        services: { getCurrentSubtitleStream, getDefaultPlayOptions, canPlayerSeek, getPlayerData, getCurrentTicks: api.getCurrentTicks },
        api
    };
}
