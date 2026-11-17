import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';

export function getLibraryIcon(library: CollectionType | string | null | undefined) {
    switch (library) {
        case CollectionType.Movies:
            return 'movie';
        case CollectionType.Music:
            return 'music_note';
        case CollectionType.Homevideos:
        case CollectionType.Photos:
            return 'photo';
        case CollectionType.Livetv:
            return 'live_tv';
        case CollectionType.Tvshows:
            return 'tv';
        case CollectionType.Trailers:
            return 'theaters';
        case CollectionType.Musicvideos:
            return 'music_video';
        case CollectionType.Books:
            return 'book';
        case CollectionType.Boxsets:
            return 'video_library';
        case CollectionType.Playlists:
            return 'queue';
        case 'channels':
            return 'videocam';
        case undefined:
            return 'ondemand_video';
        default:
            return 'folder';
    }
}

export function getItemTypeIcon(itemType: BaseItemKind | string | undefined, defaultIcon?: string) {
    switch (itemType) {
        case BaseItemKind.MusicAlbum:
            return 'album';
        case BaseItemKind.MusicArtist:
        case BaseItemKind.Person:
            return 'person';
        case BaseItemKind.Audio:
            return 'audiotrack';
        case BaseItemKind.Movie:
            return 'movie';
        case BaseItemKind.Episode:
        case BaseItemKind.Series:
            return 'tv';
        case BaseItemKind.Program:
            return 'live_tv';
        case BaseItemKind.Book:
            return 'book';
        case BaseItemKind.Folder:
            return 'folder';
        case BaseItemKind.BoxSet:
            return 'video_library';
        case BaseItemKind.Playlist:
            return 'queue';
        case BaseItemKind.Photo:
            return 'photo';
        case BaseItemKind.PhotoAlbum:
            return 'photo_album';
        default:
            return defaultIcon;
    }
}

export default {
    getLibraryIcon,
    getItemTypeIcon
};
