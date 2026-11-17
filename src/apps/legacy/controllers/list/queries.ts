import { ServerConnections } from 'lib/jellyfin-apiclient';
import * as userSettings from 'scripts/settings/userSettings';
import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import type { ItemDto } from 'types/base/models/item-dto';
import type { ListSettings } from './settings';
import type { ListParams, ListQuery } from './types';
import { parseOptionalBoolean } from './policies';

const liveTvBooleanFields = ['IsMovie', 'IsSeries', 'IsNews', 'IsSports', 'IsKids', 'IsAiring'] as const;

function getInitialLiveTvQuery(instance: ListSettings, params: ListParams, startIndex = 0, limit = 300) {
    const query: ListQuery = {
        UserId: ServerConnections.getApiClient(params.serverId)!.getCurrentUserId(),
        StartIndex: startIndex,
        Fields: 'ChannelInfo,PrimaryImageAspectRatio',
        Limit: limit
    };

    if (params.type === 'Recordings') {
        query.IsInProgress = false;
    } else {
        query.HasAired = false;
    }

    if (params.genreId) {
        query.GenreIds = params.genreId;
    }

    for (const field of liveTvBooleanFields) {
        const value = parseOptionalBoolean(params[field]);
        if (value !== undefined) query[field] = value;
    }

    return modifyQueryWithFilters(instance, query);
}

function applyMediaFilters(query: ListQuery, filters: ReturnType<ListSettings['getFilters']>) {
    let hasFilters = false;
    if (filters.VideoTypes) {
        hasFilters = true;
        query.VideoTypes = filters.VideoTypes;
    }

    if (filters.GenreIds) {
        hasFilters = true;
        query.GenreIds = filters.GenreIds;
    }

    if (filters.Is4K) {
        query.Is4K = true;
        hasFilters = true;
    }

    if (filters.IsHD) {
        query.IsHD = true;
        hasFilters = true;
    }

    if (filters.IsSD) {
        query.IsHD = false;
        hasFilters = true;
    }

    if (filters.Is3D) {
        query.Is3D = true;
        hasFilters = true;
    }

    if (filters.HasSubtitles) {
        query.HasSubtitles = true;
        hasFilters = true;
    }

    if (filters.HasTrailer) {
        query.HasTrailer = true;
        hasFilters = true;
    }

    if (filters.HasSpecialFeature) {
        query.HasSpecialFeature = true;
        hasFilters = true;
    }

    if (filters.HasThemeSong) {
        query.HasThemeSong = true;
        hasFilters = true;
    }

    if (filters.HasThemeVideo) {
        query.HasThemeVideo = true;
        hasFilters = true;
    }

    return hasFilters;
}

function modifyQueryWithFilters(instance: ListSettings, query: ListQuery) {
    const sortValues = instance.getSortValues();

    if (!query.SortBy) {
        query.SortBy = sortValues.sortBy;
        query.SortOrder = sortValues.sortOrder;
    }

    query.Fields = query.Fields ? query.Fields + ',PrimaryImageAspectRatio' : 'PrimaryImageAspectRatio';
    query.ImageTypeLimit = 1;
    let hasFilters: boolean | undefined;
    const queryFilters = [];
    const filters = instance.getFilters();

    if (filters.IsPlayed) {
        queryFilters.push('IsPlayed');
        hasFilters = true;
    }

    if (filters.IsUnplayed) {
        queryFilters.push('IsUnplayed');
        hasFilters = true;
    }

    if (filters.IsFavorite) {
        queryFilters.push('IsFavorite');
        hasFilters = true;
    }

    if (filters.IsResumable) {
        queryFilters.push('IsResumable');
        hasFilters = true;
    }

    hasFilters = applyMediaFilters(query, filters) || hasFilters;

    query.Filters = queryFilters.length ? queryFilters.join(',') : null;
    instance.setFilterStatus(hasFilters);

    if (instance.alphaPicker) {
        const newValue = instance.alphaPicker.value();
        if (newValue === '#') {
            query.NameLessThan = 'A';
            delete query.NameStartsWith;
        } else {
            query.NameStartsWith = newValue;
            delete query.NameLessThan;
        }
    }

    return query;
}

export function getItems(instance: ListSettings, params: ListParams, item: ItemDto | null, sortBy: string | null, startIndex: number, limit?: number) {
    const apiClient = ServerConnections.getApiClient(params.serverId)!;

    instance.queryRecursive = false;
    if (params.type === 'Recordings') {
        return apiClient.getLiveTvRecordings(getInitialLiveTvQuery(instance, params, startIndex, limit));
    }

    if (params.type === 'Programs') {
        if (params.IsAiring === 'true') {
            return apiClient.getLiveTvRecommendedPrograms(getInitialLiveTvQuery(instance, params, startIndex, limit));
        }

        return apiClient.getLiveTvPrograms(getInitialLiveTvQuery(instance, params, startIndex, limit));
    }

    if (params.type === 'nextup') {
        return apiClient.getNextUpEpisodes(modifyQueryWithFilters(instance, {
            Limit: limit,
            Fields: 'PrimaryImageAspectRatio,DateCreated,MediaSourceCount,Chapters,Trickplay',
            UserId: apiClient.getCurrentUserId(),
            ImageTypeLimit: 1,
            EnableImageTypes: 'Primary,Backdrop,Thumb',
            EnableTotalRecordCount: false,
            SortBy: sortBy,
            EnableRewatching: userSettings.enableRewatchingInNextUp()
        }));
    }

    if (!item) {
        instance.queryRecursive = true;
        let method: 'getItems' | 'getArtists' | 'getPeople' = 'getItems';

        if (params.type === 'MusicArtist') {
            method = 'getArtists';
        } else if (params.type === 'Person') {
            method = 'getPeople';
        }

        return apiClient[method](apiClient.getCurrentUserId(), modifyQueryWithFilters(instance, {
            StartIndex: startIndex,
            Limit: limit,
            Fields: 'PrimaryImageAspectRatio,SortName,Chapters,Trickplay',
            ImageTypeLimit: 1,
            IncludeItemTypes: params.type === 'MusicArtist' || params.type === 'Person' ? null : params.type,
            Recursive: true,
            IsFavorite: params.IsFavorite === 'true' || null,
            ArtistIds: params.artistId || null,
            SortBy: sortBy,
            Tags: params.tag || null
        }));
    }

    return getParentItems(instance, params, item, sortBy, startIndex, limit);
}

function getParentItems(instance: ListSettings, params: ListParams, item: ItemDto, sortBy: string | null, startIndex: number, limit?: number) {
    const apiClient = ServerConnections.getApiClient(params.serverId)!;
    if (item.Type === 'Genre' || item.Type === 'MusicGenre' || item.Type === 'Studio' || item.Type === 'Person') {
        instance.queryRecursive = true;
        const query: ListQuery = {
            StartIndex: startIndex,
            Limit: limit,
            Fields: 'PrimaryImageAspectRatio,SortName',
            Recursive: true,
            parentId: params.parentId,
            SortBy: sortBy
        };

        if (item.Type === 'Studio') {
            query.StudioIds = item.Id;
        } else if (item.Type === 'Genre' || item.Type === 'MusicGenre') {
            query.GenreIds = item.Id;
        } else if (item.Type === 'Person') {
            query.PersonIds = item.Id;
        }

        if (item.Type === 'MusicGenre') {
            query.IncludeItemTypes = 'MusicAlbum';
        } else if (item.CollectionType === CollectionType.Movies) {
            query.IncludeItemTypes = 'Movie';
        } else if (item.CollectionType === CollectionType.Tvshows) {
            query.IncludeItemTypes = 'Series';
        } else if (item.Type === 'Genre') {
            query.IncludeItemTypes = 'Audiobook,Book,BoxSet,Movie,Series,Video';
        } else if (item.Type === 'Person') {
            query.IncludeItemTypes = params.type;
        }

        return apiClient.getItems(apiClient.getCurrentUserId(), modifyQueryWithFilters(instance, query));
    }

    const query: ListQuery = {
        StartIndex: startIndex,
        Limit: limit,
        Fields: 'PrimaryImageAspectRatio,SortName,Path,ChildCount,MediaSourceCount',
        ImageTypeLimit: 1,
        ParentId: item.Id,
        SortBy: sortBy
    };

    if (params.type) {
        instance.queryRecursive = true;
        query.Recursive = true;
        query.IncludeItemTypes = params.type;
    } else if (sortBy === 'Random') {
        instance.queryRecursive = true;
        query.IncludeItemTypes = 'Video,Movie,Series,Music,MusicVideo';
        query.Recursive = true;
    }

    return apiClient.getItems(apiClient.getCurrentUserId(), modifyQueryWithFilters(instance, query));
}

export function getItem(params: ListParams) {
    if ([ 'Recordings', 'Programs', 'nextup', 'tag' ].includes(params.type!)) {
        return Promise.resolve(null);
    }

    const apiClient = ServerConnections.getApiClient(params.serverId)!;
    const itemId = params.genreId || params.musicGenreId || params.studioId || params.personId || params.parentId;

    if (itemId) {
        return apiClient.getItem(apiClient.getCurrentUserId(), itemId);
    }

    return Promise.resolve(null);
}

