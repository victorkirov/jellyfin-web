import { getFolderPlaybackSort, getEpisodeStartIndex } from 'lib/playback/itemSelection';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import { MediaType } from '@jellyfin/sdk/lib/generated-client/models/media-type';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import type { PlaybackItem, PlaybackOptions, PlaybackQuery, PlaybackResult } from 'lib/playback/types';
import loading from '../loading/loading';
import { pluginManager } from '../pluginManager';
import type { PlaybackContext } from './playbackContext';
import { UNLIMITED_ITEMS, getItemsForPlayback, mergePlaybackQueries } from './playbackItemQueries';
import { showPlaybackInfoErrorMessage } from './playbackNegotiation';
import { getPlayer } from './playbackRegistry';

export function createPlaybackItems(self: PlaybackContext) {
    function onPlayerLoadFailure(error: unknown) {
        loading.hide();
        showPlaybackInfoErrorMessage(self, 'ErrorPlayerNotFound');
        throw error;
    }

    function sortItemsIfNeeded(items: PlaybackItem[], options: PlaybackOptions) {
        if (items.length > 1 && options?.ids) {
            // Use the original request id array for sorting the result in the proper order
            items.sort(function (a, b) {
                return options.ids!.indexOf(a.Id!) - options.ids!.indexOf(b.Id!);
            });
        }
    }

    function getPlaybackPromise(firstItem: PlaybackItem, serverId: string | null | undefined, options: PlaybackOptions, queryOptions: PlaybackQuery, items: PlaybackItem[]) {
        const SortBy = options.shuffle ? ItemSortBy.Random : ItemSortBy.SortName;

        switch (firstItem.Type) {
            case BaseItemKind.Program:
                return getItemsForPlayback(serverId, {
                    Ids: firstItem.ChannelId!
                });
            case BaseItemKind.Playlist:
                return getItemsForPlayback(serverId, {
                    ParentId: firstItem.Id,
                    SortBy: options.shuffle ? SortBy : undefined
                });
            case BaseItemKind.MusicArtist:

                return getItemsForPlayback(serverId, mergePlaybackQueries({
                    ArtistIds: firstItem.Id,
                    Recursive: true,
                    SortBy: options.shuffle ? SortBy : [
                        ItemSortBy.Album,
                        ItemSortBy.ParentIndexNumber,
                        ItemSortBy.IndexNumber,
                        ItemSortBy.SortName
                    ].join(','),
                    MediaTypes: MediaType.Audio
                }, queryOptions));
            case BaseItemKind.PhotoAlbum:
                return getItemsForPlayback(serverId, mergePlaybackQueries({
                    ParentId: firstItem.Id,
                    // Setting this to true may cause some incorrect sorting
                    Recursive: false,
                    SortBy,
                    // Only include Photos because we do not handle mixed queues currently
                    MediaTypes: MediaType.Photo,
                    Limit: UNLIMITED_ITEMS
                }, queryOptions));
            case BaseItemKind.MusicGenre:
                return getItemsForPlayback(serverId, mergePlaybackQueries({
                    GenreIds: firstItem.Id,
                    Recursive: true,
                    SortBy,
                    MediaTypes: MediaType.Audio
                }, queryOptions));
            case BaseItemKind.Genre:
                return getItemsForPlayback(serverId, mergePlaybackQueries({
                    GenreIds: firstItem.Id,
                    ParentId: firstItem.ParentId,
                    Recursive: true,
                    SortBy,
                    MediaTypes: MediaType.Video
                }, queryOptions));
            case BaseItemKind.Studio:
                return getItemsForPlayback(serverId, mergePlaybackQueries({
                    StudioIds: firstItem.Id,
                    Recursive: true,
                    SortBy,
                    MediaTypes: MediaType.Video
                }, queryOptions));
            case BaseItemKind.Person:
                return getItemsForPlayback(serverId, mergePlaybackQueries({
                    PersonIds: firstItem.Id,
                    ParentId: firstItem.ParentId,
                    Recursive: true,
                    SortBy,
                    MediaTypes: MediaType.Video
                }, queryOptions));
            case BaseItemKind.Series:
            case BaseItemKind.Season:
                return getSeriesOrSeasonPlaybackPromise(firstItem, options, items);
            case BaseItemKind.Episode:
                return getEpisodePlaybackPromise(firstItem, options, items);
        }

        return getNonItemTypePromise(firstItem, serverId, options, queryOptions);
    }

    function getNonItemTypePromise(firstItem: PlaybackItem, serverId: string | null | undefined, options: PlaybackOptions, queryOptions: PlaybackQuery) {
        if (firstItem.MediaType === 'Photo') {
            return getItemsForPlayback(serverId, mergePlaybackQueries({
                ParentId: firstItem.ParentId,
                Filters: 'IsNotFolder',
                // Setting this to true may cause some incorrect sorting
                Recursive: false,
                SortBy: options.shuffle ? 'Random' : 'SortName',
                MediaTypes: 'Photo,Video',
                Limit: UNLIMITED_ITEMS
            }, queryOptions)).then(function (result) {
                const playbackItems = result.Items;

                let index = playbackItems.map(function (i) {
                    return i.Id;
                }).indexOf(firstItem.Id);

                if (index === -1) {
                    index = 0;
                }

                options.startIndex = index;

                return Promise.resolve(result);
            });
        } else if (firstItem.IsFolder && firstItem.CollectionType === 'homevideos') {
            return getItemsForPlayback(serverId, mergePlaybackQueries({
                ParentId: firstItem.Id,
                Filters: 'IsNotFolder',
                Recursive: true,
                SortBy: options.shuffle ? 'Random' : 'SortName',
                // Only include Photos because we do not handle mixed queues currently
                MediaTypes: 'Photo',
                Limit: UNLIMITED_ITEMS
            }, queryOptions));
        } else if (firstItem.IsFolder && firstItem.CollectionType === 'musicvideos') {
            return getItemsForPlayback(serverId, mergePlaybackQueries({
                ParentId: firstItem.Id,
                Filters: 'IsNotFolder',
                Recursive: true,
                SortBy: options.shuffle ? 'Random' : 'SortName',
                MediaTypes: 'Video',
                Limit: UNLIMITED_ITEMS
            }, queryOptions));
        } else if (firstItem.IsFolder) {
            return getItemsForPlayback(serverId, mergePlaybackQueries({
                ParentId: firstItem.Id,
                Filters: 'IsNotFolder',
                Recursive: true,
                // These are pre-sorted
                SortBy: getFolderPlaybackSort(firstItem, options.shuffle),
                MediaTypes: 'Audio,Video'
            }, queryOptions));
        }

        return null;
    }

    async function getSeriesOrSeasonPlaybackPromise(firstItem: PlaybackItem, options: PlaybackOptions, items: PlaybackItem[]) {
        const apiClient = ServerConnections.getApiClient(firstItem.ServerId);
        const startSeasonId = firstItem.Type === 'Season' ? items[options.startIndex || 0].Id : undefined;

        const seasonId = (startSeasonId && items.length === 1) ? startSeasonId : undefined;
        const SeriesId = firstItem.SeriesId || firstItem.Id;
        const UserId = apiClient!.getCurrentUserId();

        let startItemId;

        // Start from a specific (the next unwatched) episode if we want to watch in order and have not chosen a specific season
        if (!options.shuffle && !seasonId) {
            const nextUp = await apiClient!.getNextUpEpisodes({ SeriesId, UserId });
            startItemId = nextUp?.Items?.[0]?.Id;
        }

        const episodesResult = await apiClient!.getEpisodes(SeriesId!, {
            IsVirtualUnaired: false,
            IsMissing: false,
            SeasonId: seasonId,
            // default to first 100 episodes if no season was specified to avoid loading too large payloads
            limit: seasonId ? undefined : 100,
            SortBy: options.shuffle ? 'Random' : undefined,
            UserId,
            Fields: [ItemFields.Chapters, ItemFields.MediaSources, ItemFields.Trickplay],
            startItemId
        });

        episodesResult.StartIndex = options.shuffle ? 0 : getEpisodeStartIndex(
            episodesResult.Items!, startSeasonId, Boolean(startSeasonId && items.length != 1)
        );

        // TODO: fix calling code to read episodesResult.StartIndex instead when set.
        options.startIndex = episodesResult.StartIndex;

        episodesResult.TotalRecordCount = episodesResult.Items!.length;

        return episodesResult;
    }

    function getEpisodePlaybackPromise(firstItem: PlaybackItem, options: PlaybackOptions, items: PlaybackItem[]) {
        if (items.length === 1 && getPlayer(self, firstItem, options).supportsProgress !== false) {
            return getEpisodes(firstItem, options);
        } else {
            return null;
        }
    }

    function getEpisodes(firstItem: PlaybackItem, options: PlaybackOptions) {
        return new Promise<(PlaybackResult & { StartIndex?: number }) | null>(function (resolve, reject) {
            const apiClient = ServerConnections.getApiClient(firstItem.ServerId);

            const { SeriesId, Id } = firstItem;
            if (!SeriesId) {
                resolve(null);
                return;
            }

            apiClient!.getEpisodes(SeriesId!, {
                IsVirtualUnaired: false,
                IsMissing: false,
                UserId: apiClient!.getCurrentUserId(),
                Fields: [ItemFields.Chapters, ItemFields.MediaSources, ItemFields.Trickplay],
                // limit to loading 100 episodes to avoid loading too large payload
                limit: 100,
                startItemId: Id
            }).then(function (episodesResult) {
                resolve(filterEpisodes(episodesResult as PlaybackResult & { StartIndex?: number }, firstItem, options));
            }, reject);
        });
    }

    function filterEpisodes(episodesResult: PlaybackResult & { StartIndex?: number }, firstItem: PlaybackItem, options: PlaybackOptions) {
        let startItemFound = false;
        for (const [index, e] of episodesResult.Items.entries()) {
            if (e.Id === firstItem.Id) {
                episodesResult.StartIndex = index;
                startItemFound = true;
                break;
            }
        }

        // An alternate version is not part of the episode listing, so the result starts at
        // its primary episode instead. Keep playing the version the user picked by selecting
        // it as the media source of that primary (unless a source was explicitly chosen).
        if (!startItemFound && episodesResult.Items.length) {
            episodesResult.StartIndex = 0;
            options.mediaSourceId = options.mediaSourceId || firstItem.Id;
        }

        // TODO: fix calling code to read episodesResult.StartIndex instead when set.
        options.startIndex = episodesResult.StartIndex;
        episodesResult.TotalRecordCount = episodesResult.Items.length;
        return episodesResult;
    }

    const api = {
        translateItemsForPlayback: async function(items: PlaybackItem[], options: PlaybackOptions) {
            if (!items.length) return [];

            await pluginManager.prepareForPlayback(items).catch(onPlayerLoadFailure);

            sortItemsIfNeeded(items, options);

            const firstItem = items[0];
            const serverId = firstItem.ServerId;
            const queryOptions = options.queryOptions || {};

            const promise = getPlaybackPromise(firstItem, serverId, options, queryOptions, items);

            if (promise) {
                const result = await promise;
                const translated = result ? result.Items! : items;
                await pluginManager.prepareForPlayback(translated).catch(onPlayerLoadFailure);
                return translated;
            } else {
                return items;
            }
        }
    };
    return {

        services: { translateItemsForPlayback: api.translateItemsForPlayback },
        api
    };
}
