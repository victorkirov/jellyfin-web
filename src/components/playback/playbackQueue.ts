import { ServerConnections } from 'lib/jellyfin-apiclient';
import { enableLocalPlaylistManagement } from 'lib/playback/playerSelection';
import type { PlaybackItem, PlaybackOptions } from 'lib/playback/types';
import type { PlaybackPlayer } from 'types/plugin';
import Events from '../../utils/events';
import type { PlaybackContext, PlaybackServices } from './playbackContext';
import { getItemsForPlayback } from './playbackItemQueries';
import { setStreamUrls } from './playbackNegotiation';
import { getMatchingMediaSource } from './playbackRegistry';

export function createPlaybackQueue(self: PlaybackContext, services: Pick<PlaybackServices, 'getDefaultPlayOptions' | 'playInternal' | 'getPlayerData' | 'translateItemsForPlayback'>) {
    // Set playlist state. Using a method allows for overloading in derived player implementations
    function setPlaylistState(playlistItemId: string, index: number) {
        if (!isNaN(index)) {
            (self._playQueueManager.setPlaylistState as (id: string, legacyIndex?: number) => void)(playlistItemId, index);
        }
    }

    function getPreviousSource(player: PlaybackPlayer) {
        const prevSource = self.currentMediaSource(player);
        const prevPlayerData = services.getPlayerData(player);
        return {
            ...prevSource,
            DefaultAudioStreamIndex: prevPlayerData.audioStreamIndex,
            DefaultSubtitleStreamIndex: prevPlayerData.subtitleStreamIndex,
            DefaultSecondarySubtitleStreamIndex: prevPlayerData.secondarySubtitleStreamIndex
        };
    }

    function queue(options: PlaybackOptions, mode: string, player: PlaybackPlayer | null | undefined) {
        player = (player || self._currentPlayer)!;

        if (!player) {
            return self.play(options);
        }

        if (options.items) {
            return services.translateItemsForPlayback(options.items, options).then(function (items: PlaybackItem[]) {
                // TODO: Handle options.startIndex for photos
                queueAll(items, mode, player);
            });
        } else {
            if (!options.serverId) {
                throw new Error('serverId required!');
            }

            return getItemsForPlayback(options.serverId, {
                Ids: options.ids!.join(',')
            }).then(function (result) {
                return services.translateItemsForPlayback(result.Items, options).then(function (items: PlaybackItem[]) {
                    // TODO: Handle options.startIndex for photos
                    queueAll(items, mode, player);
                });
            });
        }
    }

    function queueAll(items: PlaybackItem[], mode: string, player: PlaybackPlayer) {
        if (!items.length) {
            return;
        }

        if (!player.isLocalPlayer) {
            if (mode === 'next') {
                player.queueNext!({
                    items: items
                });
            } else {
                player.queue!({
                    items: items
                });
            }
            return;
        }

        const queueDirectToPlayer = player && !enableLocalPlaylistManagement(player);

        if (queueDirectToPlayer) {
            const apiClient = ServerConnections.getApiClient(items[0].ServerId);

            void player.getDeviceProfile(items[0]).then(function (profile) {
                void setStreamUrls(items, profile, self.getMaxStreamingBitrate(player), apiClient!, 0).then(function () {
                    if (mode === 'next') {
                        player.queueNext!(items);
                    } else {
                        player.queue!(items);
                    }
                });
            });

            return;
        }

        if (mode === 'next') {
            self._playQueueManager.queueNext(items);
        } else {
            self._playQueueManager.queue(items);
        }
        Events.trigger(player, 'playlistitemadd');
    }

    const api = {
        getItemFromPlaylistItemId: function (playlistItemId: string) {
            let item;
            let itemIndex;
            const playlist = self._playQueueManager.getPlaylist();

            for (let i = 0, length = playlist.length; i < length; i++) {
                if (playlist[i].PlaylistItemId === playlistItemId) {
                    item = playlist[i];
                    itemIndex = i;
                    break;
                }
            }

            return {
                Item: item,
                Index: itemIndex
            };
        },
        setCurrentPlaylistItem: function (playlistItemId: string, player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.setCurrentPlaylistItem!(playlistItemId);
            }

            const newItem = self.getItemFromPlaylistItemId(playlistItemId);

            if (newItem.Item) {
                const newItemPlayOptions = newItem.Item.playOptions || services.getDefaultPlayOptions();

                void services.playInternal(newItem.Item, newItemPlayOptions, function () {
                    setPlaylistState(newItem.Item!.PlaylistItemId!, newItem.Index!);
                });
            }
        },
        removeFromPlaylist: function (playlistItemIds: string[], player?: PlaybackPlayer | null) {
            if (!playlistItemIds) {
                throw new Error('Invalid playlistItemIds');
            }

            player = (player || self._currentPlayer)!;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.removeFromPlaylist!(playlistItemIds);
            }

            const removeResult = self._playQueueManager.removeFromPlaylist(playlistItemIds);

            if (removeResult.result === 'empty') {
                return self.stop(player);
            }

            const isCurrentIndex = removeResult.isCurrentIndex;

            Events.trigger(player, 'playlistitemremove', [
                {
                    playlistItemIds: playlistItemIds
                }
            ]);

            if (isCurrentIndex) {
                return self.setCurrentPlaylistItem(self._playQueueManager.getPlaylist()[0].PlaylistItemId, player);
            }

            return Promise.resolve();
        },
        movePlaylistItem: function (playlistItemId: string, newIndex: number, player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.movePlaylistItem!(playlistItemId, newIndex);
            }

            const moveResult = self._playQueueManager.movePlaylistItem(playlistItemId, newIndex);

            if (moveResult.result === 'noop') {
                return;
            }

            Events.trigger(player, 'playlistitemmove', [
                {
                    playlistItemId: moveResult.playlistItemId,
                    newIndex: moveResult.newIndex
                }
            ]);
        },
        getCurrentPlaylistIndex: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.getCurrentPlaylistIndex!();
            }

            return self._playQueueManager.getCurrentPlaylistIndex();
        },
        getCurrentPlaylistItemId: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.getCurrentPlaylistItemId!();
            }

            return self._playQueueManager.getCurrentPlaylistItemId();
        },
        channelUp: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            return self.nextTrack(player);
        },
        channelDown: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            return self.previousTrack(player);
        },
        nextTrack: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.nextTrack!();
            }

            const newItemInfo = self._playQueueManager.getNextItemInfo();

            if (newItemInfo) {
                console.debug('playing next track');

                const prevSource = getPreviousSource(player);
                const newItemPlayOptions = newItemInfo.item.playOptions || services.getDefaultPlayOptions();
                const versionSource = getMatchingMediaSource(newItemInfo.item.MediaSources, prevSource);

                if (versionSource) {
                    newItemPlayOptions.mediaSourceId = versionSource.Id!;
                }

                void services.playInternal(newItemInfo.item, newItemPlayOptions, function () {
                    setPlaylistState(newItemInfo.item.PlaylistItemId, newItemInfo.index);
                }, prevSource);
            }
        },
        previousTrack: function (player?: PlaybackPlayer | null) {
            player = (player || self._currentPlayer)!;
            if (player && !enableLocalPlaylistManagement(player)) {
                return player.previousTrack!();
            }

            const newIndex = self.getCurrentPlaylistIndex(player) - 1;
            if (newIndex >= 0) {
                const playlist = self._playQueueManager.getPlaylist();
                const newItem = playlist[newIndex];

                if (newItem) {
                    const prevSource = getPreviousSource(player);
                    const newItemPlayOptions = newItem.playOptions || services.getDefaultPlayOptions();
                    newItemPlayOptions.startPositionTicks = 0;
                    const versionSource = getMatchingMediaSource(newItem.MediaSources, prevSource);

                    if (versionSource) {
                        newItemPlayOptions.mediaSourceId = versionSource.Id!;
                    }

                    void services.playInternal(newItem, newItemPlayOptions, function () {
                        setPlaylistState(newItem.PlaylistItemId, newIndex);
                    }, prevSource);
                }
            }
        },
        queue: function (this: PlaybackContext, options: PlaybackOptions, player = this._currentPlayer) {
            return queue(options, '', player);
        },
        queueNext: function (this: PlaybackContext, options: PlaybackOptions, player = this._currentPlayer) {
            return queue(options, 'next', player);
        }
    };
    return {

        services: { setPlaylistState },
        api
    };
}
