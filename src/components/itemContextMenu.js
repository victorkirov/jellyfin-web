import globalize from '../lib/globalize';
import actionsheet from './actionSheet/actionSheet';
import { appRouter } from './router/appRouter';
import itemHelper from './itemHelper';
import { playbackManager } from './playback/playbackmanager';
import * as userSettings from '../scripts/settings/userSettings';

export async function getCommands(options) {
    const item = options.item;

    const canPlay = playbackManager.canPlay(item);

    const commands = [];

    if (canPlay && item.MediaType !== 'Photo') {
        if (options.play !== false) {
            commands.push({
                name: globalize.translate('Play'),
                id: 'resume',
                icon: 'play_arrow'
            });
        }

        if (options.playAllFromHere && item.Type !== 'Program' && item.Type !== 'TvChannel') {
            commands.push({
                name: globalize.translate('PlayAllFromHere'),
                id: 'playallfromhere',
                icon: 'play_arrow'
            });
        }
    }

    if (playbackManager.getCurrentPlayer() !== null) {
        if (options.stopPlayback) {
            commands.push({
                name: globalize.translate('StopPlayback'),
                id: 'stopPlayback',
                icon: 'stop'
            });
        }
        if (options.clearQueue) {
            commands.push({
                name: globalize.translate('ClearQueue'),
                id: 'clearQueue',
                icon: 'clear_all'
            });
        }
    }

    if (playbackManager.canQueue(item)) {
        if (options.queue !== false) {
            commands.push({
                name: globalize.translate('AddToPlayQueue'),
                id: 'queue',
                icon: 'playlist_add'
            });
        }

        if (options.queue !== false) {
            commands.push({
                name: globalize.translate('PlayNext'),
                id: 'queuenext',
                icon: 'playlist_add'
            });
        }
    }

    if ((item.IsFolder || item.Type === 'MusicArtist' || item.Type === 'MusicGenre')
            && item.CollectionType !== 'livetv'
            && options.shuffle !== false
    ) {
        commands.push({
            name: globalize.translate('Shuffle'),
            id: 'shuffle',
            icon: 'shuffle'
        });
    }

    if ((item.MediaType === 'Audio' || item.Type === 'MusicAlbum' || item.Type === 'MusicArtist' || item.Type === 'MusicGenre')
            && options.instantMix !== false && !itemHelper.isLocalItem(item)
    ) {
        commands.push({
            name: globalize.translate('InstantMix'),
            id: 'instantmix',
            icon: 'explore'
        });
    }

    if (commands.length) {
        commands.push({
            divider: true
        });
    }

    if (item.MediaSources && options.moremediainfo !== false) {
        commands.push({
            name: globalize.translate('MoreMediaInfo'),
            id: 'moremediainfo',
            icon: 'info'
        });
    }

    if (options.openAlbum !== false && item.AlbumId && item.MediaType !== 'Photo') {
        commands.push({
            name: globalize.translate('ViewAlbum'),
            id: 'album',
            icon: 'album'
        });
    }
    // Show Album Artist by default, as a song can have multiple artists, which specific one would this option refer to?
    // Although some albums can have multiple artists, it's not as common as songs.
    if (options.openArtist !== false && item.AlbumArtists?.length) {
        commands.push({
            name: globalize.translate('ViewAlbumArtist'),
            id: 'artist',
            icon: 'person'
        });
    }

    if (item.HasLyrics) {
        commands.push({
            name: globalize.translate('ViewLyrics'),
            id: 'lyrics',
            icon: 'lyrics'
        });
    }

    return commands;
}

function getResolveFunction(resolve, commandId) {
    return function () {
        resolve({
            command: commandId
        });
    };
}

function executeCommand(item, id) {
    const itemId = item.Id;
    const serverId = item.ServerId;

    return new Promise(function (resolve, reject) {
        switch (id) {
            case 'moremediainfo':
                import('./itemMediaInfo/itemMediaInfo').then((itemMediaInfo) => {
                    itemMediaInfo.show(itemId, serverId).then(getResolveFunction(resolve, id), getResolveFunction(resolve, id));
                });
                break;
            case 'open':
                appRouter.showItem(item);
                getResolveFunction(resolve, id)();
                break;
            case 'play':
                play(item, false);
                getResolveFunction(resolve, id)();
                break;
            case 'resume':
                play(item, true);
                getResolveFunction(resolve, id)();
                break;
            case 'queue':
                play(item, false, true);
                getResolveFunction(resolve, id)();
                break;
            case 'queuenext':
                play(item, false, true, true);
                getResolveFunction(resolve, id)();
                break;
            case 'stopPlayback':
                playbackManager.stop();
                break;
            case 'clearQueue':
                playbackManager.clearQueue();
                break;
            case 'shuffle':
                playbackManager.shuffle(item);
                getResolveFunction(resolve, id)();
                break;
            case 'instantmix':
                playbackManager.instantMix(item);
                getResolveFunction(resolve, id)();
                break;
            case 'album':
                appRouter.showItem(item.AlbumId, item.ServerId);
                getResolveFunction(resolve, id)();
                break;
            case 'artist':
                appRouter.showItem(item.AlbumArtists[0].Id, item.ServerId);
                getResolveFunction(resolve, id)();
                break;
            case 'lyrics': {
                appRouter.showItem(item.Id, item.ServerId);
                getResolveFunction(resolve, id)();
                break;
            }
            case 'playallfromhere':
                getResolveFunction(resolve, id)();
                break;
            case 'queueallfromhere':
                getResolveFunction(resolve, id)();
                break;
            default:
                reject();
                break;
        }
    });
}

function play(item, resume, queue, queueNext) {
    let method = 'play';
    if (queue) {
        if (queueNext) {
            method = 'queueNext';
        } else {
            method = 'queue';
        }
    }

    let startPosition = 0;
    if (resume && item.UserData?.PlaybackPositionTicks) {
        startPosition = item.UserData.PlaybackPositionTicks;
    }

    if (item.Type === 'Program') {
        playbackManager[method]({
            ids: [item.ChannelId],
            startPositionTicks: startPosition,
            serverId: item.ServerId
        });
    } else {
        const sortParentId = 'items-' + (item.IsFolder ? item.Id : item.ParentId) + '-Folder';
        const sortValues = userSettings.getSortValuesLegacy(sortParentId);

        playbackManager[method]({
            items: [item],
            startPositionTicks: startPosition,
            queryOptions: {
                SortBy: sortValues.sortBy,
                SortOrder: sortValues.sortOrder
            }
        });
    }
}

export async function show(options) {
    const commands = await getCommands(options);
    if (!commands.length) {
        throw new Error('No item commands present');
    }

    const id = await actionsheet.show({
        items: commands,
        positionTo: options.positionTo
    });

    return executeCommand(options.item, id);
}

export default {
    getCommands,
    show
};
