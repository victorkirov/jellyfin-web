import { PluginType } from 'constants/pluginType';
import { enableLocalPlaylistManagement } from 'lib/playback/playerSelection';
import type { PlaybackItem, PlaybackMediaSource, PlaybackOptions, PlaybackTarget } from 'lib/playback/types';
import Screenfull from 'screenfull';
import type { PlaybackPlayer } from 'types/plugin';
import Events from '../../utils/events';
import { pluginManager } from '../pluginManager';
import type { PlaybackContext, PlaybackServices } from './playbackContext';
import { isServerItem } from './playbackItemQueries';

export function bindToFullscreenChange(player: PlaybackPlayer) {
    if (Screenfull.isEnabled) {
        Screenfull.on('change', function () {
            Events.trigger(player, 'fullscreenchange', [Screenfull.isFullscreen]);
        });
    } else {
    // iOS Safari
        document.addEventListener('webkitfullscreenchange', function () {
            Events.trigger(player, 'fullscreenchange', [(document as Document & { webkitIsFullScreen?: boolean }).webkitIsFullScreen]);
        }, false);
    }
}

export function triggerPlayerChange(playbackManagerInstance: PlaybackContext, newPlayer: PlaybackPlayer | null | undefined, newTarget: PlaybackTarget | null | undefined, previousPlayer: PlaybackPlayer | null | undefined, previousTargetInfo: PlaybackTarget | null | undefined) {
    if (!newPlayer && !previousPlayer) {
        return;
    }

    if (newTarget && previousTargetInfo && newTarget.id === previousTargetInfo.id) {
        return;
    }

    Events.trigger(playbackManagerInstance, 'playerchange', [newPlayer, newTarget, previousPlayer]);
}

export function isAutomaticPlayer(player: PlaybackPlayer) {
    return player.isLocalPlayer;
}

export function getAutomaticPlayers(instance: PlaybackContext, forceLocalPlayer?: boolean) {
    if (!forceLocalPlayer) {
        const player = instance._currentPlayer;
        if (player && !isAutomaticPlayer(player)) {
            return [player];
        }
    }

    return instance.getPlayers().filter(isAutomaticPlayer);
}

export function displayPlayerIndividually(player: PlaybackPlayer) {
    return !player.isLocalPlayer;
}

export function createTarget(instance: PlaybackContext | PlaybackPlayer, player?: PlaybackPlayer | null) {
    return {
        name: player!.name,
        id: player!.id,
        playerName: player!.name,
        playableMediaTypes: ['Audio', 'Video', 'Photo', 'Book'].map(player!.canPlayMediaType),
        isLocalPlayer: player!.isLocalPlayer,
        supportedCommands: (instance as PlaybackContext).getSupportedCommands(player!)
    };
}

export function getPlayerTargets(player: PlaybackPlayer) {
    if (player.getTargets) {
        return player.getTargets();
    }

    // Preserve the legacy remote fallback; native adapters supply their own getTargets.
    return Promise.resolve([createTarget(player)]);
}

export function sortPlayerTargets(a: PlaybackTarget, b: PlaybackTarget) {
    let aVal: number | string = a.isLocalPlayer ? 0 : 1;
    let bVal: number | string = b.isLocalPlayer ? 0 : 1;

    aVal = aVal.toString() + a.name;
    bVal = bVal.toString() + b.name;

    return aVal.localeCompare(bVal);
}

export function getPlayer(self: PlaybackContext, item: PlaybackItem, playOptions: PlaybackOptions, forceLocalPlayers?: boolean) {
    const serverItem = isServerItem(item);
    return getAutomaticPlayers(self, forceLocalPlayers).filter(function (p) {
        if (p.canPlayMediaType(item.MediaType)) {
            if (serverItem) {
                if (p.canPlayItem) {
                    return p.canPlayItem(item, playOptions);
                }
                return true;
            } else if (item.Url && p.canPlayUrl) {
                return p.canPlayUrl(item.Url);
            }
        }

        return false;
    })[0];
}

export // Find the version (media source) whose name matches the currently playing version,
// so track navigation keeps the same version across episodes.
function getMatchingMediaSource(mediaSources: PlaybackMediaSource[] | null | undefined, prevSource: PlaybackMediaSource | null | undefined) {
    const versionName = prevSource?.Name;

    if (!versionName || !prevSource.hasAlternateVersions || (mediaSources?.length ?? 0) < 2) {
        return null;
    }

    return mediaSources!.find(source => source.Name === versionName);
}

export function createPlaybackRegistry(self: PlaybackContext, services: Pick<PlaybackServices, 'onPlaybackError' | 'onPlaybackTimeUpdate' | 'onPlaybackPause' | 'onPlaybackUnpause' | 'onPlaybackVolumeChange' | 'onRepeatModeChange' | 'onShuffleQueueModeChange' | 'onPlaylistItemMove' | 'onPlaylistItemRemove' | 'onPlaylistItemAdd' | 'onPlaybackStartedFromSelfManagingPlayer' | 'onPlaybackStoppedFromSelfManagingPlayer' | 'bindStopped'>) {
    const players: PlaybackPlayer[] = [];

    let currentTargetInfo: PlaybackTarget | null | undefined;

    let currentPairingId: string | null = null;

    function removeCurrentPlayer(player: PlaybackPlayer) {
        const previousPlayer = self._currentPlayer;

        if (!previousPlayer || player.id === previousPlayer.id) {
            setCurrentPlayerInternal(null);
        }
    }

    function setCurrentPlayerInternal(player: PlaybackPlayer | null, targetInfo?: PlaybackTarget | null) {
        const previousPlayer = self._currentPlayer;
        const previousTargetInfo = currentTargetInfo;

        if (player && !targetInfo && player.isLocalPlayer) {
            targetInfo = createTarget(self, player);
        }

        if (player && !targetInfo) {
            throw new Error('targetInfo cannot be null');
        }

        currentPairingId = null;
        self._currentPlayer = player;
        currentTargetInfo = targetInfo;

        if (targetInfo) {
            console.debug('Active player: ' + JSON.stringify(targetInfo));
        }

        if (previousPlayer) {
            self.endPlayerUpdates(previousPlayer);
        }

        if (player) {
            self.beginPlayerUpdates(player);
        }

        triggerPlayerChange(self, player, targetInfo, previousPlayer, previousTargetInfo);
    }

    function initLegacyVolumeMethods(player: PlaybackPlayer) {
        player.getVolume = function () {
            return player.volume!();
        };
        player.setVolume = function (val: number) {
            return player.volume!(val);
        };
    }

    function initMediaPlayer(player: PlaybackPlayer) {
        players.push(player);
        players.sort(function (a, b) {
            return (a.priority || 0) - (b.priority || 0);
        });

        if (player.isLocalPlayer !== false) {
            player.isLocalPlayer = true;
        }

        player.currentState = {};

        if (!player.getVolume || !player.setVolume) {
            initLegacyVolumeMethods(player);
        }

        if (enableLocalPlaylistManagement(player)) {
            Events.on(player, 'error', services.onPlaybackError);
            Events.on(player, 'timeupdate', services.onPlaybackTimeUpdate);
            Events.on(player, 'pause', services.onPlaybackPause);
            Events.on(player, 'unpause', services.onPlaybackUnpause);
            Events.on(player, 'volumechange', services.onPlaybackVolumeChange);
            Events.on(player, 'repeatmodechange', services.onRepeatModeChange);
            Events.on(player, 'shufflequeuemodechange', services.onShuffleQueueModeChange);
            Events.on(player, 'playlistitemmove', services.onPlaylistItemMove);
            Events.on(player, 'playlistitemremove', services.onPlaylistItemRemove);
            Events.on(player, 'playlistitemadd', services.onPlaylistItemAdd);
        } else if (player.isLocalPlayer) {
            Events.on(player, 'itemstarted', services.onPlaybackStartedFromSelfManagingPlayer);
            Events.on(player, 'itemstopped', services.onPlaybackStoppedFromSelfManagingPlayer);
            Events.on(player, 'timeupdate', services.onPlaybackTimeUpdate);
            Events.on(player, 'pause', services.onPlaybackPause);
            Events.on(player, 'unpause', services.onPlaybackUnpause);
            Events.on(player, 'volumechange', services.onPlaybackVolumeChange);
            Events.on(player, 'repeatmodechange', services.onRepeatModeChange);
            Events.on(player, 'shufflequeuemodechange', services.onShuffleQueueModeChange);
            Events.on(player, 'playlistitemmove', services.onPlaylistItemMove);
            Events.on(player, 'playlistitemremove', services.onPlaylistItemRemove);
            Events.on(player, 'playlistitemadd', services.onPlaylistItemAdd);
        }

        if (player.isLocalPlayer) {
            bindToFullscreenChange(player);
        }
        services.bindStopped(player);
    }

    const api = {
        getPlayerInfo: function () {
            const player = self._currentPlayer;

            if (!player) {
                return null;
            }

            const target: Partial<PlaybackTarget> = currentTargetInfo || {};

            return {
                name: player.name,
                isLocalPlayer: player.isLocalPlayer,
                id: target.id,
                deviceName: target.deviceName,
                playableMediaTypes: target.playableMediaTypes,
                supportedCommands: target.supportedCommands
            };
        },
        setActivePlayer: function (player: PlaybackPlayer | string, targetInfo?: PlaybackTarget) {
            if (player === 'localplayer' || (player as PlaybackPlayer).name === 'localplayer') {
                if (self._currentPlayer?.isLocalPlayer) {
                    return;
                }
                setCurrentPlayerInternal(null, null);
                return;
            }

            if (typeof (player) === 'string') {
                player = players.filter(function (p) {
                    return p.name === player;
                })[0];
            }

            if (!player) {
                throw new Error('null player');
            }

            setCurrentPlayerInternal(player, targetInfo);
        },
        trySetActivePlayer: function (player: PlaybackPlayer | string, targetInfo?: PlaybackTarget) {
            if (player === 'localplayer' || (player as PlaybackPlayer).name === 'localplayer') {
                if (self._currentPlayer?.isLocalPlayer) {
                    return;
                }
                return;
            }

            if (typeof (player) === 'string') {
                player = players.filter(function (p) {
                    return p.name === player;
                })[0];
            }

            if (!player) {
                throw new Error('null player');
            }

            if (currentPairingId === targetInfo!.id) {
                return;
            }

            currentPairingId = targetInfo!.id;

            const promise = player.tryPair ?
                player.tryPair(targetInfo!) :
                Promise.resolve();

            Events.trigger(self, 'pairing');

            promise.then(function () {
                Events.trigger(self, 'paired');
                setCurrentPlayerInternal(player, targetInfo);
            }, function () {
                Events.trigger(self, 'pairerror');
                if (currentPairingId === targetInfo!.id) {
                    currentPairingId = null;
                }
            });
        },
        getTargets: function () {
            const promises = players.filter(displayPlayerIndividually).map(getPlayerTargets);

            return Promise.all(promises)
                .then(responses => responses.flat().sort(sortPlayerTargets));
        },
        getPlayers: function () {
            return players;
        }
    };
    return {
        activate: function () {
            Events.on(pluginManager, 'registered', function (e: unknown, plugin) {
                if (plugin.type === PluginType.MediaPlayer) initMediaPlayer(plugin);
            });
            // Registry tags identify the operational adapters registered before playback.
            (pluginManager.ofType(PluginType.MediaPlayer) as unknown as PlaybackPlayer[]).forEach(initMediaPlayer);
        },
        services: { removeCurrentPlayer, setCurrentPlayerInternal },
        api
    };
}
