import type { bindSkipSegment } from './skipsegment';
import type { MediaStream } from '@jellyfin/sdk/lib/generated-client/models/media-stream';
import { MediaType } from '@jellyfin/sdk/lib/generated-client/models/media-type';
import { AppFeature } from 'constants/appFeature';
import { TICKS_PER_MILLISECOND, TICKS_PER_SECOND } from 'constants/time';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { PlaybackAttempt } from 'lib/playback/playbackAttempt';
import loading from '../loading/loading';
import { enableLocalPlaylistManagement } from 'lib/playback/playerSelection';
import type { PlaybackItem, PlaybackOptions } from 'lib/playback/types';
import { bindMediaSegmentManager } from 'lib/playback/utils/mediaSegmentManager';
import { bindMediaSessionSubscriber } from 'lib/playback/utils/mediaSessionSubscriber';
import type { PlaybackPlayer } from 'types/plugin';
import * as userSettings from '../../scripts/settings/userSettings';
import Events from '../../utils/events';
import { appHost } from '../apphost';
import itemHelper from '../itemHelper';
import { bindBrightnessPresentation } from './brightnessPresentation';
import type { PlaybackContext, PlaybackServices } from './playbackContext';
import { initializePlaybackManager } from './playbackSession';
import PlayQueueManager from './playqueuemanager';

const optionalPlayerCommands = ['PictureInPicture', 'AirPlay', 'SetBrightness', 'SetAspectRatio', 'PlaybackRate'];

type WirePlaybackCommand = { Name: string; Arguments?: Record<string, unknown> };
type PlaybackCommand =
    | { Name: 'SetRepeatMode' | 'SetShuffleQueue' | 'SetAspectRatio'; value: string }
    | { Name: 'SetVolume' | 'PlaybackRate' | 'SetBrightness' | 'SetAudioStreamIndex' | 'SetSubtitleStreamIndex' | 'SetMaxStreamingBitrate'; value: number }
    | { Name: 'VolumeUp' | 'VolumeDown' | 'Mute' | 'Unmute' | 'ToggleMute' | 'ToggleFullscreen' }
    | { Name: 'Forward'; command: WirePlaybackCommand };

const commandArgumentKeys = {
    SetRepeatMode: 'RepeatMode',
    SetShuffleQueue: 'ShuffleMode',
    SetAspectRatio: 'AspectRatio',
    SetVolume: 'Volume',
    PlaybackRate: 'PlaybackRate',
    SetBrightness: 'Brightness',
    SetAudioStreamIndex: 'Index',
    SetSubtitleStreamIndex: 'Index',
    SetMaxStreamingBitrate: 'Bitrate'
} as const;

function numericCommandValue(raw: unknown) {
    if ((typeof raw !== 'number' && typeof raw !== 'string') || (typeof raw === 'string' && !raw.trim())) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}

function normalizeCommand(command: WirePlaybackCommand): PlaybackCommand | null {
    const args = command.Arguments || {};
    switch (command.Name) {
        case 'SetRepeatMode':
        case 'SetShuffleQueue':
        case 'SetAspectRatio': {
            const value = args[commandArgumentKeys[command.Name]];
            return typeof value === 'string' && value ? { Name: command.Name, value } : null;
        }
        case 'SetVolume':
        case 'PlaybackRate':
        case 'SetBrightness':
        case 'SetAudioStreamIndex':
        case 'SetSubtitleStreamIndex':
        case 'SetMaxStreamingBitrate': {
            const value = numericCommandValue(args[commandArgumentKeys[command.Name]]);
            return value === null ? null : { Name: command.Name, value };
        }
        case 'VolumeUp':
        case 'VolumeDown':
        case 'Mute':
        case 'Unmute':
        case 'ToggleMute':
        case 'ToggleFullscreen':
            return { Name: command.Name };
        default:
            return { Name: 'Forward', command };
    }
}

function normalizeName(t: string) {
    return t.toLowerCase().replace(' ', '');
}

class PlaybackManagerCore {
    readonly _playbackAttempt = new PlaybackAttempt();

    _playNextAfterEnded!: boolean;
    _playQueueManager!: PlayQueueManager;
    _currentPlayer?: PlaybackPlayer | null;
    _skipSegment?: ReturnType<typeof bindSkipSegment>;
    readonly _services: PlaybackServices;
    constructor() {
        const session = initializePlaybackManager(this as unknown as PlaybackContext);
        this._services = session.services;
        Object.assign(this, session.api);
        session.activate();
        bindBrightnessPresentation(this);
    }

    getCurrentPlayer(this: PlaybackContext) {
        return this._currentPlayer;
    }

    // Players may have no position until their media element is initialized.
    currentTime(this: PlaybackContext, player = this._currentPlayer): number | undefined {
        if (player && !enableLocalPlaylistManagement(player) && !player.isLocalPlayer) {
            return player.currentTime();
        }

        return this.getCurrentTicks(player) / TICKS_PER_MILLISECOND;
    }

    getNextItem(this: PlaybackContext) {
        return this._playQueueManager.getNextItemInfo();
    }

    nextItem(this: PlaybackContext, player = this._currentPlayer) {
        if (player && !enableLocalPlaylistManagement(player)) {
            return player.nextItem!();
        }

        const nextItem = this._playQueueManager.getNextItemInfo();

        if (!nextItem?.item) {
            return Promise.reject();
        }

        const apiClient = ServerConnections.getApiClient(nextItem.item.ServerId);
        return apiClient!.getItem(apiClient!.getCurrentUserId(), nextItem.item.Id);
    }

    canQueue(this: PlaybackContext, item: PlaybackItem) {
        if (item.Type === 'MusicAlbum' || item.Type === 'MusicArtist' || item.Type === 'MusicGenre') {
            return this.canQueueMediaType('Audio');
        }
        return this.canQueueMediaType(item.MediaType);
    }

    canQueueMediaType(this: PlaybackContext, mediaType: string | null | undefined) {
        if (this._currentPlayer) {
            return this._currentPlayer.canPlayMediaType(mediaType);
        }

        return false;
    }

    isMuted(this: PlaybackContext, player = this._currentPlayer) {
        if (player) {
            return player.isMuted();
        }

        return false;
    }

    setMute(this: PlaybackContext, mute: boolean, player = this._currentPlayer) {
        if (player) {
            player.setMute!(mute);
        }
    }

    toggleMute(this: PlaybackContext, mute?: unknown, player = this._currentPlayer) {
        if (player) {
            if (player.toggleMute) {
                player.toggleMute();
            } else {
                player.setMute!(!player.isMuted());
            }
        }
    }

    nextChapter(this: PlaybackContext, player = this._currentPlayer) {
        const item = this.currentItem(player);

        const ticks = this.getCurrentTicks(player);

        const nextChapter = (item!.Chapters || []).filter(function (i) {
            return i.StartPositionTicks! > ticks;
        })[0];

        if (nextChapter) {
            this.seek(nextChapter.StartPositionTicks!, player);
        } else {
            this.nextTrack(player);
        }
    }

    previousChapter(this: PlaybackContext, player = this._currentPlayer) {
        const item = this.currentItem(player);

        let ticks = this.getCurrentTicks(player);

        // Go back 10 seconds
        ticks -= 10 * TICKS_PER_SECOND;

        // If there's no previous track, then at least rewind to beginning
        if (this.getCurrentPlaylistIndex(player) === 0) {
            ticks = Math.max(ticks, 0);
        }

        const previousChapters = (item!.Chapters || []).filter(function (i) {
            return i.StartPositionTicks! <= ticks;
        });

        if (previousChapters.length) {
            this.seek(previousChapters[previousChapters.length - 1].StartPositionTicks!, player);
        } else {
            this.previousTrack(player);
        }
    }

    fastForward(this: PlaybackContext, player = this._currentPlayer) {
        if (player!.fastForward != null) {
            player!.fastForward(userSettings.skipForwardLength());
            return;
        }

        // Go back 15 seconds
        const offsetTicks = userSettings.skipForwardLength() * TICKS_PER_MILLISECOND;

        this.seekRelative(offsetTicks, player);
    }

    rewind(this: PlaybackContext, player = this._currentPlayer) {
        if (player!.rewind != null) {
            player!.rewind(userSettings.skipBackLength());
            return;
        }

        // Go back 15 seconds
        const offsetTicks = 0 - (userSettings.skipBackLength() * TICKS_PER_MILLISECOND);

        this.seekRelative(offsetTicks, player);
    }

    seekFrames(this: PlaybackContext, frames = 1, player = this._currentPlayer) {
        // Only allow seeking by frames when paused
        if (!player!.paused()) return;

        const source = this.currentMediaSource(player);
        const videoStream = source?.MediaStreams?.find(s => s.Type === MediaType.Video);
        // It only makes sense to seek video streams by frames
        if (videoStream) {
            const fps = videoStream.ReferenceFrameRate || 24;
            this.seekRelative(frames / fps * TICKS_PER_SECOND, player);
        }
    }

    seekPercent(this: PlaybackContext, percent: number, player = this._currentPlayer) {
        let ticks = this.duration(player) || 0;

        percent /= 100;
        ticks *= percent;
        this.seek(parseInt(String(ticks), 10), player);
    }

    seekMs(this: PlaybackContext, ms: unknown, player = this._currentPlayer) {
        // Remote command options historically use JavaScript numeric coercion here.
        const ticks = Number(ms) * TICKS_PER_MILLISECOND;
        this.seek(ticks, player);
    }

    async playTrailers(this: PlaybackContext, item: PlaybackItem) {
        const player = this._currentPlayer;

        if (player?.playTrailers) {
            return player.playTrailers(item);
        }

        const apiClient = ServerConnections.getApiClient(item.ServerId);

        let items: PlaybackItem[] | undefined;

        if (item.LocalTrailerCount) {
            items = await apiClient!.getLocalTrailers(apiClient!.getCurrentUserId(), item.Id!);
        }

        if (!items?.length) {
            items = (item.RemoteTrailers || []).map((t) => {
                return {
                    Name: t.Name || (item.Name + ' Trailer'),
                    Url: t.Url,
                    MediaType: 'Video',
                    Type: 'Trailer',
                    ServerId: apiClient!.serverId()
                };
            });
        }

        if (items.length) {
            return this.play({
                items
            });
        }

        return Promise.reject();
    }

    getSubtitleUrl(this: PlaybackContext, textStream: MediaStream, serverId: string) {
        const apiClient = ServerConnections.getApiClient(serverId);

        return !textStream.IsExternalUrl ? apiClient!.getUrl(textStream.DeliveryUrl!) : textStream.DeliveryUrl;
    }

    stop(this: PlaybackContext, player?: PlaybackPlayer | null) {
        const ownsLoading = this._playbackAttempt.invalidate();
        if (ownsLoading) loading.hide();
        const stoppedPlayer = player || this._currentPlayer;
        if (!stoppedPlayer) return Promise.resolve();
        if (!enableLocalPlaylistManagement(stoppedPlayer)) return stoppedPlayer.stop(true, true);

        this._playNextAfterEnded = false;
        stoppedPlayer.isChangingStream = false;
        const streamInfo = stoppedPlayer.streamInfo;
        const generation = this._playbackAttempt.capture();
        return stoppedPlayer.stop(true, true).then(result => {
            if (this._playbackAttempt.isCurrent(generation) && this._currentPlayer === stoppedPlayer
                && stoppedPlayer.streamInfo === streamInfo) {
                // An already-idle player may resolve Stop without another stopped event.
                this._services.onPlaybackStopped.call(stoppedPlayer);
            }
            return result;
        });
    }

    getBufferedRanges(this: PlaybackContext, player = this._currentPlayer) {
        if (player?.getBufferedRanges) {
            return player.getBufferedRanges();
        }

        return [];
    }

    playPause(this: PlaybackContext, player = this._currentPlayer) {
        if (player) {
            if (player.playPause) {
                return player.playPause();
            }

            if (player.paused()) {
                return this.unpause(player);
            } else {
                return this.pause(player);
            }
        }
    }

    paused(this: PlaybackContext, player = this._currentPlayer) {
        if (player) {
            return player.paused();
        }
    }

    pause(this: PlaybackContext, player = this._currentPlayer) {
        if (player) {
            player.pause!();
        }
    }

    unpause(this: PlaybackContext, player = this._currentPlayer) {
        if (player) {
            player.unpause!();
        }
    }

    setPlaybackRate(this: PlaybackContext, value: number, player = this._currentPlayer) {
        if (player?.setPlaybackRate) {
            player.setPlaybackRate(value);

            // Save the new playback rate in the browser session, to restore when playing a new video.
            sessionStorage.setItem('playbackRateSpeed', String(value));
        }
    }

    getPlaybackRate(this: PlaybackContext, player = this._currentPlayer) {
        if (player?.getPlaybackRate) {
            return player.getPlaybackRate();
        }

        return null;
    }

    instantMix(this: PlaybackContext, item: PlaybackItem, player = this._currentPlayer) {
        if (player?.instantMix) {
            return player.instantMix(item);
        }

        const apiClient = ServerConnections.getApiClient(item.ServerId);

        const options = {
            UserId: apiClient!.getCurrentUserId(),
            Limit: 200
        };

        void apiClient!.getInstantMixFromItem(item.Id!, options).then((result) => {
            void this.play({
                items: result.Items
            });
        });
    }

    shuffle(this: PlaybackContext, shuffleItem: PlaybackItem, player = this._currentPlayer) {
        if (player?.shuffle) {
            return player.shuffle(shuffleItem);
        }

        return this.play({ items: [shuffleItem], shuffle: true });
    }

    audioTracks(this: PlaybackContext, player = this._currentPlayer) {
        if (player!.audioTracks) {
            const result = player!.audioTracks();
            if (result) {
                return result.sort(itemHelper.sortTracks);
            }
        }

        const mediaSource = this.currentMediaSource(player);

        const mediaStreams = mediaSource?.MediaStreams || [];
        return mediaStreams.filter(function (s) {
            return s.Type === 'Audio';
        }).sort(itemHelper.sortTracks);
    }

    subtitleTracks(this: PlaybackContext, player = this._currentPlayer) {
        if (player!.subtitleTracks) {
            const result = player!.subtitleTracks();
            if (result) {
                return result.sort(itemHelper.sortTracks);
            }
        }

        const mediaSource = this.currentMediaSource(player);

        const mediaStreams = mediaSource?.MediaStreams || [];
        return mediaStreams.filter(function (s) {
            return s.Type === 'Subtitle';
        }).sort(itemHelper.sortTracks);
    }

    getSupportedCommands(this: PlaybackContext, player?: PlaybackPlayer | null) {
        const selectedPlayer: Partial<PlaybackPlayer> = player || this._currentPlayer || { isLocalPlayer: true };

        if (selectedPlayer.isLocalPlayer) {
            const list = [
                'GoHome',
                'GoToSettings',
                'VolumeUp',
                'VolumeDown',
                'Mute',
                'Unmute',
                'ToggleMute',
                'SetVolume',
                'SetAudioStreamIndex',
                'SetSubtitleStreamIndex',
                'SetMaxStreamingBitrate',
                'DisplayContent',
                'GoToSearch',
                'DisplayMessage',
                'SetRepeatMode',
                'SetShuffleQueue',
                'PlayMediaSource',
                'PlayTrailers'
            ];

            if (appHost.supports(AppFeature.Fullscreen)) {
                list.push('ToggleFullscreen');
            }

            if (selectedPlayer.supports) {
                for (const command of optionalPlayerCommands) {
                    if (selectedPlayer.supports(command)) list.push(command);
                }
            }

            return list;
        }

        const info = this.getPlayerInfo();
        return info ? info.supportedCommands : [];
    }

    setRepeatMode(this: PlaybackContext, value: string, player = this._currentPlayer) {
        if (player && !enableLocalPlaylistManagement(player)) {
            return player.setRepeatMode!(value);
        }

        this._playQueueManager.setRepeatMode(value);
        Events.trigger(player, 'repeatmodechange');
    }

    getRepeatMode(this: PlaybackContext, player = this._currentPlayer) {
        if (player && !enableLocalPlaylistManagement(player)) {
            return player.getRepeatMode!();
        }

        return this._playQueueManager.getRepeatMode();
    }

    setQueueShuffleMode(this: PlaybackContext, value: string, player = this._currentPlayer) {
        if (player && !enableLocalPlaylistManagement(player)) {
            return player.setQueueShuffleMode!(value);
        }

        this._playQueueManager.setShuffleMode(value);
        Events.trigger(player, 'shufflequeuemodechange');
    }

    getQueueShuffleMode(this: PlaybackContext, player = this._currentPlayer) {
        if (player && !enableLocalPlaylistManagement(player)) {
            return player.getQueueShuffleMode!();
        }

        return this._playQueueManager.getShuffleMode();
    }

    toggleQueueShuffleMode(this: PlaybackContext, player = this._currentPlayer) {
        let currentvalue;
        if (player && !enableLocalPlaylistManagement(player)) {
            currentvalue = player.getQueueShuffleMode!();
            switch (currentvalue) {
                case 'Shuffle':
                    player.setQueueShuffleMode!('Sorted');
                    break;
                case 'Sorted':
                    player.setQueueShuffleMode!('Shuffle');
                    break;
                default:
                    throw new TypeError('current value for shufflequeue is invalid');
            }
        } else {
            this._playQueueManager.toggleShuffleMode();
        }
        Events.trigger(player, 'shufflequeuemodechange');
    }

    clearQueue(this: PlaybackContext, clearCurrentItem = false, player = this._currentPlayer) {
        if (player && !enableLocalPlaylistManagement(player)) {
            return player.clearQueue!(clearCurrentItem);
        }

        this._playQueueManager.clearPlaylist(clearCurrentItem);
        Events.trigger(player, 'playlistitemremove');
    }

    trySetActiveDeviceName(this: PlaybackContext, name: string) {
        name = normalizeName(name);

        void this.getTargets().then((result) => {
            const target = result.filter(function (p) {
                return normalizeName(p.name) === name;
            })[0];

            if (target) {
                this.trySetActivePlayer(target.playerName!, target);
            }
        });
    }

    displayContent(this: PlaybackContext, options: PlaybackOptions, player = this._currentPlayer) {
        if (player?.displayContent) {
            player.displayContent(options);
        }
    }

    beginPlayerUpdates(this: PlaybackContext, player: PlaybackPlayer) {
        if (player.beginPlayerUpdates) {
            player.beginPlayerUpdates();
        }
    }

    endPlayerUpdates(this: PlaybackContext, player: PlaybackPlayer) {
        if (player.endPlayerUpdates) {
            player.endPlayerUpdates();
        }
    }

    setDefaultPlayerActive(this: PlaybackContext) {
        this.setActivePlayer('localplayer');
    }

    removeActivePlayer(this: PlaybackContext, name: string) {
        const playerInfo = this.getPlayerInfo();
        if (playerInfo?.name === name) {
            this.setDefaultPlayerActive();
        }
    }

    removeActiveTarget(this: PlaybackContext, id: string) {
        const playerInfo = this.getPlayerInfo();
        if (playerInfo?.id === id) {
            this.setDefaultPlayerActive();
        }
    }

    sendCommand(this: PlaybackContext, command: WirePlaybackCommand, player = this._currentPlayer): void | Promise<unknown> {
        const cmd = normalizeCommand(command);
        if (!cmd || !player) return;
        console.debug('MediaController received command: ' + command.Name);
        switch (cmd.Name) {
            case 'SetRepeatMode':
                this.setRepeatMode(cmd.value, player);
                break;
            case 'SetShuffleQueue':
                this.setQueueShuffleMode(cmd.value, player);
                break;
            case 'VolumeUp':
                this.volumeUp(player);
                break;
            case 'VolumeDown':
                this.volumeDown(player);
                break;
            case 'Mute':
                this.setMute(true, player);
                break;
            case 'Unmute':
                this.setMute(false, player);
                break;
            case 'ToggleMute':
                this.toggleMute(undefined, player);
                break;
            case 'SetVolume':
                this.setVolume(cmd.value, player);
                break;
            case 'SetAspectRatio':
                this.setAspectRatio(cmd.value, player);
                break;
            case 'PlaybackRate':
                this.setPlaybackRate(cmd.value, player);
                break;
            case 'SetBrightness':
                this.setBrightness(cmd.value, player);
                break;
            case 'SetAudioStreamIndex':
                this.setAudioStreamIndex(cmd.value, player);
                break;
            case 'SetSubtitleStreamIndex':
                this.setSubtitleStreamIndex(cmd.value, player);
                break;
            case 'SetMaxStreamingBitrate':
                return this.setMaxStreamingBitrate({ maxBitrate: cmd.value }, player).catch((error: unknown) => {
                    console.error('Failed to apply bitrate command', error);
                });
            case 'ToggleFullscreen':
                this.toggleFullscreen(player);
                break;
            case 'Forward':
                player.sendCommand?.(cmd.command);
                break;
        }
    }
}

const ComposedPlaybackManager = PlaybackManagerCore as new () => PlaybackManagerCore & ReturnType<typeof initializePlaybackManager>['api'];

export class PlaybackManager extends ComposedPlaybackManager {}

export const playbackManager = new PlaybackManager();
bindMediaSegmentManager(playbackManager);
bindMediaSessionSubscriber(playbackManager);

window.addEventListener('beforeunload', function () {
    try {
        playbackManager.onAppClose();
    } catch (err) {
        console.error('error in onAppClose: ' + err);
    }
});
