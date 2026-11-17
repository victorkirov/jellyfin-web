import type { PlaybackPlayer } from 'types/plugin';

export function enableLocalPlaylistManagement(player: PlaybackPlayer) {
    return !player.getPlaylist && player.isLocalPlayer;
}
