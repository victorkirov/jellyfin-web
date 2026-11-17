import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';

import { appHost } from './apphost';
import { AppFeature } from 'constants/appFeature';
import globalize from 'lib/globalize';

export function getDisplayName(item, options = {}) {
    if (!item) {
        throw new Error('null item passed into getDisplayName');
    }

    if (item.Type === 'Timer') {
        item = item.ProgramInfo || item;
    }

    let name = ((item.Type === 'Program' || item.Type === 'Recording') && (item.IsSeries || item.EpisodeTitle) ? item.EpisodeTitle : item.Name) || '';

    if (item.Type === 'TvChannel') {
        if (item.ChannelNumber) {
            return item.ChannelNumber + ' ' + name;
        }
        return name;
    }
    if (item.Type === 'Episode' && item.ParentIndexNumber === 0) {
        name = globalize.translate('ValueSpecialEpisodeName', name);
    } else if ((item.Type === 'Episode' || item.Type === 'Program' || item.Type === 'Recording') && item.IndexNumber != null && item.ParentIndexNumber != null && options.includeIndexNumber !== false) {
        let displayIndexNumber = item.IndexNumber;

        let number = displayIndexNumber;
        let nameSeparator = ' - ';

        if (options.includeParentInfo !== false) {
            number = 'S' + item.ParentIndexNumber + ':E' + number;
        } else {
            nameSeparator = '. ';
        }

        if (item.IndexNumberEnd) {
            displayIndexNumber = item.IndexNumberEnd;
            number += '-' + displayIndexNumber;
        }

        if (number) {
            name = name ? (number + nameSeparator + name) : number;
        }
    }

    return name;
}

export function isLocalItem(item) {
    return item?.Id && typeof item.Id === 'string' && item.Id.indexOf('local') === 0;
}

export function canShare (item, user) {
    if (item.Type === 'Program') {
        return false;
    }
    if (item.Type === 'TvChannel') {
        return false;
    }
    if (item.Type === 'Timer') {
        return false;
    }
    if (item.Type === 'SeriesTimer') {
        return false;
    }
    if (item.Type === 'Recording' && item.Status !== 'Completed') {
        return false;
    }
    if (isLocalItem(item)) {
        return false;
    }
    return user.Policy.EnablePublicSharing && appHost.supports(AppFeature.Sharing);
}

export function enableDateAddedDisplay (item) {
    return !item.IsFolder && item.MediaType && item.Type !== 'Program' && item.Type !== 'TvChannel' && item.Type !== 'Trailer';
}

export function canMarkPlayed (item) {
    if (item.Type === 'Program') {
        return false;
    }

    if (item.MediaType === 'Video') {
        if (item.Type !== 'TvChannel') {
            return true;
        }
    } else if (item.MediaType === 'Audio') {
        if (item.Type === 'AudioBook') {
            return true;
        }
    }

    return item.Type === 'Series'
        || item.Type === 'Season'
        || item.Type === 'BoxSet'
        || item.Type === 'Folder'
        || item.MediaType === 'Book';
}

export function canRate (item) {
    return item.Type !== 'Program'
        && item.Type !== 'Timer'
        && item.Type !== 'SeriesTimer'
        && item.Type !== 'CollectionFolder'
        && item.Type !== 'UserView'
        && item.Type !== 'Channel'
        && item.UserData;
}

export function canConvert (item, user) {
    if (!user.Policy.EnableMediaConversion) {
        return false;
    }

    if (isLocalItem(item)) {
        return false;
    }

    const mediaType = item.MediaType;
    if (mediaType === 'Book' || mediaType === 'Photo' || mediaType === 'Audio') {
        return false;
    }

    const collectionType = item.CollectionType;
    if (collectionType === CollectionType.Livetv) {
        return false;
    }

    const type = item.Type;
    if (type === 'Channel' || type === 'Person' || type === 'Year' || type === 'Program' || type === 'Timer' || type === 'SeriesTimer') {
        return false;
    }

    if (item.LocationType === 'Virtual' && !item.IsFolder) {
        return false;
    }

    return !item.IsPlaceHolder;
}

export function supportsMediaSourceSelection (item) {
    if (item.MediaType !== 'Video') {
        return false;
    }
    if (item.Type === 'TvChannel') {
        return false;
    }
    if (!item.MediaSources || (item.MediaSources.length === 1 && item.MediaSources[0].Type === 'Placeholder')) {
        return false;
    }

    if (item.EnableMediaSourceDisplay != null) {
        return !!item.EnableMediaSourceDisplay;
    }

    return !item.SourceType || item.SourceType === 'Library';
}

export function sortTracks (trackA, trackB) {
    let cmp = trackA.IsExternal - trackB.IsExternal;
    if (cmp != 0) return cmp;
    cmp = trackB.IsForced - trackA.IsForced;
    if (cmp != 0) return cmp;
    cmp = trackB.IsDefault - trackA.IsDefault;
    if (cmp != 0) return cmp;

    return trackA.Index - trackB.Index;
}

export default {
    getDisplayName: getDisplayName,
    isLocalItem: isLocalItem,
    canShare: canShare,
    enableDateAddedDisplay: enableDateAddedDisplay,
    canMarkPlayed: canMarkPlayed,
    canRate: canRate,
    canConvert: canConvert,
    supportsMediaSourceSelection: supportsMediaSourceSelection,
    sortTracks: sortTracks
};
