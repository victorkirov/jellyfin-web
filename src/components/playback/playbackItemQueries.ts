import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { ItemFilter } from '@jellyfin/sdk/lib/generated-client/models/item-filter';
import type { ApiClient as PlaybackApiClient } from 'jellyfin-apiclient';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import type { PlaybackItem, PlaybackOptions, PlaybackQuery, PlaybackResult, PlaybackStreamInfo } from 'lib/playback/types';
import merge from 'lodash-es/merge';
import * as userSettings from '../../scripts/settings/userSettings';
import { getItems } from '../../utils/jellyfin-apiclient/getItems';

export const UNLIMITED_ITEMS = -1;

export function getItemsForPlayback(serverId: string | null | undefined, query: PlaybackQuery): Promise<PlaybackResult> {
    const apiClient = ServerConnections.getApiClient(serverId);

    if (query.Ids && query.Ids.split(',').length === 1) {
        const itemId = query.Ids.split(',');

        // The legacy client stringifies this single-element ID array in its URL builder.
        return apiClient!.getItem(apiClient!.getCurrentUserId(), itemId as unknown as string).then(function (item: PlaybackItem) {
            return {
                Items: [item],
                TotalRecordCount: 1
            };
        });
    } else {
        if (query.Limit === UNLIMITED_ITEMS) {
            delete query.Limit;
        } else {
            query.Limit = query.Limit || 300;
        }
        query.Fields = [ItemFields.Chapters, ItemFields.MediaSources, ItemFields.Trickplay];
        query.ExcludeLocationTypes = 'Virtual';
        query.EnableTotalRecordCount = false;
        query.CollapseBoxSetItems = false;

        return getItems(apiClient!, apiClient!.getCurrentUserId(), query) as Promise<PlaybackResult>;
    }
}

export function createStreamInfoFromUrlItem(item: PlaybackItem): PlaybackStreamInfo {
// Check item.Path for games
    return {
        url: item.Url || item.Path,
        playMethod: 'DirectPlay',
        item: item,
        textTracks: [],
        mediaType: item.MediaType
    };
}

export function mergePlaybackQueries(obj1: PlaybackQuery, obj2?: PlaybackQuery) {
    const query = merge({}, obj1, obj2);

    const filters = query.Filters?.split(',') || [];
    if (!filters.includes(ItemFilter.IsNotFolder)) {
        filters.push(ItemFilter.IsNotFolder);
    }
    query.Filters = filters.join(',');
    return query;
}

export function isServerItem(item: PlaybackItem) {
    return !!item.Id;
}

export function enableIntros(item: PlaybackItem) {
    if (item.MediaType !== 'Video') {
        return false;
    }
    if (item.Type === 'TvChannel') {
        return false;
    }
    // disable for in-progress recordings
    if (item.Status === 'InProgress') {
        return false;
    }

    return isServerItem(item);
}

export function getIntros(firstItem: PlaybackItem, apiClient: PlaybackApiClient, options: PlaybackOptions) {
    if (options.startPositionTicks || options.startIndex || options.fullscreen === false || !enableIntros(firstItem) || !userSettings.enableCinemaMode()) {
        return Promise.resolve({
            Items: []
        });
    }

    return apiClient.getIntros(firstItem.Id!).then(function (result) {
        return result;
    }, function () {
        return Promise.resolve({
            Items: []
        });
    });
}

export function truncatePlayOptions(playOptions: PlaybackOptions) {
    return {
        aspectRatio: playOptions.aspectRatio,
        fullscreen: playOptions.fullscreen,
        mediaSourceId: playOptions.mediaSourceId,
        audioStreamIndex: playOptions.audioStreamIndex,
        subtitleStreamIndex: playOptions.subtitleStreamIndex,
        startPositionTicks: playOptions.startPositionTicks
    };
}

export function normalizePlayOptions(playOptions: PlaybackOptions) {
    playOptions.fullscreen = playOptions.fullscreen !== false;
}
