import { Api } from '@jellyfin/sdk/lib/api';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { ImageType } from '@jellyfin/sdk/lib/generated-client/models/image-type';
import { getImageApi } from '@jellyfin/sdk/lib/utils/api/image-api';
import { describe, expect, it } from 'vitest';

import { getItemImageUrl, getItemTypeIcon, getLibraryIcon } from './image';
import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';

const ITEM_ICON_MAP: Record<string, string | undefined> = {
    AggregateFolder: undefined,
    Audio: 'audiotrack',
    AudioBook: undefined,
    BasePluginFolder: undefined,
    Book: 'book',
    BoxSet: 'video_library',
    Channel: undefined,
    ChannelFolderItem: undefined,
    CollectionFolder: undefined,
    Episode: 'tv',
    Folder: 'folder',
    Genre: undefined,
    LiveTvChannel: undefined,
    LiveTvProgram: undefined,
    ManualPlaylistsFolder: undefined,
    Movie: 'movie',
    MusicAlbum: 'album',
    MusicArtist: 'person',
    MusicGenre: undefined,
    MusicVideo: undefined,
    Person: 'person',
    Photo: 'photo',
    PhotoAlbum: 'photo_album',
    Playlist: 'queue',
    PlaylistsFolder: undefined,
    Program: 'live_tv',
    Recording: undefined,
    Season: undefined,
    Series: 'tv',
    Studio: undefined,
    Trailer: undefined,
    TvChannel: undefined,
    TvProgram: undefined,
    UserRootFolder: undefined,
    UserView: undefined,
    Video: undefined,
    Year: undefined
};

const LIBRARY_ICON_MAP: Record<string, string | undefined> = {
    Books: 'book',
    Boxsets: 'video_library',
    Folders: 'folder',
    Homevideos: 'photo',
    Livetv: 'live_tv',
    Movies: 'movie',
    Music: 'music_note',
    Musicvideos: 'music_video',
    Photos: 'photo',
    Playlists: 'queue',
    Trailers: 'theaters',
    Tvshows: 'tv',
    Unknown: 'folder'
};

describe('getItemTypeIcon()', () => {
    it('Should return the correct icon for item type', () => {
        Object.entries(BaseItemKind).forEach(([key, value]) => {
            expect(Object.prototype.hasOwnProperty.call(ITEM_ICON_MAP, key)).toBe(true);
            expect(`${key}=${getItemTypeIcon(value)}`).toBe(`${key}=${ITEM_ICON_MAP[key]}`);
        });
    });

    it('Should return the default icon for unknown type if provided', () => {
        expect(getItemTypeIcon('foobar', 'default'))
            .toBe('default');
    });

    it('Should return undefined for unknown type', () => {
        expect(getItemTypeIcon('foobar'))
            .toBeUndefined();
    });
});

describe('getLibraryIcon()', () => {
    it('Should return the correct icon for collection type', () => {
        Object.entries(CollectionType).forEach(([key, value]) => {
            expect(Object.prototype.hasOwnProperty.call(LIBRARY_ICON_MAP, key)).toBe(true);
            expect(`${key}=${getLibraryIcon(value)}`).toBe(`${key}=${LIBRARY_ICON_MAP[key]}`);
        });
    });

    it('Should return the correct icon for nonstandard types', () => {
        expect(getLibraryIcon(undefined))
            .toBe('ondemand_video');
        expect(getLibraryIcon('channels'))
            .toBe('videocam');
    });

    it('Should return the default icon for unknown types', () => {
        expect(getLibraryIcon('foobar'))
            .toBe('folder');
    });
});

describe('getItemImageUrl()', () => {
    const api = new Api(
        'https://server:8096',
        { name: 'test', version: '1.0.0' },
        { name: 'test device', id: 'test-device' }
    );

    it('Should match the SDK url', () => {
        const params = { fillHeight: 450, fillWidth: 300, quality: 96, tag: '0a1b2c' };

        expect(getItemImageUrl(api, 'abc123', ImageType.Primary, params))
            .toBe(getImageApi(api).getItemImageUrlById('abc123', ImageType.Primary, params));
    });

    it('Should skip empty params', () => {
        expect(getItemImageUrl(api, 'abc123', ImageType.Logo, { height: undefined, tag: 'xyz' }))
            .toBe('https://server:8096/Items/abc123/Images/Logo?tag=xyz');
    });

    it('Should omit the query string without params', () => {
        expect(getItemImageUrl(api, 'abc123', ImageType.Backdrop))
            .toBe('https://server:8096/Items/abc123/Images/Backdrop');
    });
});
