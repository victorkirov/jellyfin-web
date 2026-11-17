import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';

import { AppFeature } from 'constants/appFeature';
import { ServerConnections } from 'lib/jellyfin-apiclient';

import browser from '../scripts/browser';
import { copy } from '../scripts/clipboard';
import dom from '../utils/dom';
import globalize from '../lib/globalize';
import actionsheet from './actionSheet/actionSheet';
import { appHost } from './apphost';
import { appRouter } from './router/appRouter';
import itemHelper from './itemHelper';
import { playbackManager } from './playback/playbackmanager';
import toast from './toast/toast';
import * as userSettings from '../scripts/settings/userSettings';

/** Item types that support downloading all children. */
const DOWNLOAD_ALL_TYPES = [
    BaseItemKind.BoxSet,
    BaseItemKind.MusicAlbum,
    BaseItemKind.Season,
    BaseItemKind.Series
];

export async function getCommands(options) {
    const item = options.item;
    const user = options.user;

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

    if (!browser.tv) {
        // Multiselect is currrently only ran on long clicks of card components
        // This disables Select on any context menu not originating from a card i.e songs
        if (options.positionTo && (dom.parentWithClass(options.positionTo, 'card') !== null)) {
            commands.push({
                name:  globalize.translate('Select'),
                id: 'multiSelect',
                icon: 'library_add_check'
            });
        }
    }

    if (appHost.supports(AppFeature.FileDownload)) {
        // CanDownload should probably be updated to return true for these items?
        if (user.Policy.EnableContentDownloading && DOWNLOAD_ALL_TYPES.includes(item.Type)) {
            commands.push({
                name: globalize.translate('DownloadAll'),
                id: 'downloadall',
                icon: 'file_download'
            });
        }

        // Books are promoted to major download Button and therefor excluded in the context menu
        if (item.CanDownload && item.Type !== 'Book') {
            commands.push({
                name: globalize.translate('Download'),
                id: 'download',
                icon: 'file_download'
            });

            commands.push({
                name: globalize.translate('CopyStreamURL'),
                id: 'copy-stream',
                icon: 'content_copy'
            });
        }
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

    if (!browser.tv && options.share === true && itemHelper.canShare(item, user)) {
        commands.push({
            name: globalize.translate('Share'),
            id: 'share',
            icon: 'share'
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

function executeCommand(item, id, options) {
    const itemId = item.Id;
    const serverId = item.ServerId;
    const apiClient = ServerConnections.getApiClient(serverId);
    const api = ServerConnections.getApi(serverId);

    return new Promise(function (resolve, reject) {
        switch (id) {
            case 'download':
                import('../scripts/fileDownloader').then((fileDownloader) => {
                    const url = getLibraryApi(api).getDownloadUrl({ itemId });
                    fileDownloader.download([{
                        url,
                        item,
                        itemId,
                        serverId,
                        title: item.Name,
                        filename: item.Path.replace(/^.*[\\/]/, '')
                    }]);
                    getResolveFunction(getResolveFunction(resolve, id), id)();
                });
                break;
            case 'downloadall': {
                const downloadItems = items => {
                    import('../scripts/fileDownloader').then((fileDownloader) => {
                        const downloads = items
                            .filter(i => i.CanDownload)
                            .map(i => {
                                const url = getLibraryApi(api).getDownloadUrl({ itemId: i.Id });
                                return {
                                    url,
                                    item: i,
                                    itemId: i.Id,
                                    serverId,
                                    title: i.Name,
                                    filename: i.Path.replace(/^.*[\\/]/, '')
                                };
                            });

                        fileDownloader.download(downloads);
                    });
                };
                const downloadSeasons = seasons => {
                    Promise.all(seasons.map(seasonItem => {
                        return apiClient.getEpisodes(seasonItem.SeriesId, {
                            seasonId: seasonItem.Id,
                            userId: options.user.Id,
                            Fields: 'CanDownload,Path'
                        });
                    }
                    )).then(seasonData => {
                        downloadItems(seasonData.map(season => season.Items).flat());
                    });
                };

                switch (item.Type) {
                    case BaseItemKind.BoxSet:
                    case BaseItemKind.MusicAlbum:
                        apiClient.getItems(options.user.Id, {
                            ParentId: item.Id,
                            Fields: 'CanDownload,Path'
                        }).then(({ Items }) => downloadItems(Items));
                        break;
                    case BaseItemKind.Season:
                        downloadSeasons([item]);
                        break;
                    case BaseItemKind.Series:
                        apiClient.getSeasons(item.Id, {
                            userId: options.user.Id,
                            Fields: 'ItemCounts'
                        }).then(seasons => downloadSeasons(seasons.Items));
                }

                getResolveFunction(getResolveFunction(resolve, id), id)();
                break;
            }
            case 'copy-stream': {
                const downloadHref = getLibraryApi(api).getDownloadUrl({ itemId });
                copy(downloadHref).then(() => {
                    toast(globalize.translate('CopyStreamURLSuccess'));
                }).catch(() => {
                    prompt(globalize.translate('CopyStreamURL'), downloadHref);
                });
                getResolveFunction(resolve, id)();
                break;
            }
            case 'moremediainfo':
                import('./itemMediaInfo/itemMediaInfo').then((itemMediaInfo) => {
                    itemMediaInfo.show(itemId, serverId).then(getResolveFunction(resolve, id), getResolveFunction(resolve, id));
                });
                break;
            case 'multiSelect':
                import('./multiSelect/multiSelect').then(({ startMultiSelect }) => {
                    const card = dom.parentWithClass(options.positionTo, 'card');
                    startMultiSelect(card);
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
            case 'share':
                navigator.share({
                    title: item.Name,
                    text: item.Overview,
                    url: `${apiClient.serverAddress()}/web/${appRouter.getRouteUrl(item)}`
                });
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
                if (options.isMobile) {
                    appRouter.show('lyrics');
                } else {
                    appRouter.showItem(item.Id, item.ServerId);
                }
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
        positionTo: options.positionTo,
        resolveOnClick: ['share']
    });

    return executeCommand(options.item, id, options);
}

export default {
    getCommands,
    show
};
