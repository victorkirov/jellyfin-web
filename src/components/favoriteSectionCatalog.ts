import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { getBackdropShape, getPortraitShape, getSquareShape } from './cardbuilder/utils/shape';
import type { CardRenderOptions } from './cardbuilder/cardTypes';

export type FavoriteSection = CardRenderOptions & {
    name: string;
    types: string;
    id?: string;
};

function enableScrollX() {
    return true;
}

export function getFullFavoriteSections(): FavoriteSection[] {
    return [{
        name: 'Movies',
        types: 'Movie',
        shape: getPortraitShape(enableScrollX()),
        showTitle: true,
        showYear: true,
        overlayPlayButton: true,
        overlayText: false,
        centerText: true
    }, {
        name: 'Shows',
        types: 'Series',
        shape: getPortraitShape(enableScrollX()),
        showTitle: true,
        showYear: true,
        overlayPlayButton: true,
        overlayText: false,
        centerText: true
    }, {
        name: 'HeaderSeasons',
        types: BaseItemKind.Season,
        shape: getPortraitShape(enableScrollX()),
        showTitle: true,
        showParentTitle: true,
        overlayPlayButton: true,
        overlayText: false,
        centerText: true
    }, {
        name: 'Episodes',
        types: 'Episode',
        shape: getBackdropShape(enableScrollX()),
        preferThumb: false,
        showTitle: true,
        showParentTitle: true,
        overlayPlayButton: true,
        overlayText: false,
        centerText: true
    }, {
        name: 'HeaderVideos',
        types: 'Video',
        shape: getBackdropShape(enableScrollX()),
        preferThumb: true,
        showTitle: true,
        overlayPlayButton: true,
        overlayText: false,
        centerText: true
    }, {
        name: 'MusicVideos',
        types: 'MusicVideo',
        shape: getBackdropShape(enableScrollX()),
        preferThumb: true,
        showTitle: true,
        overlayPlayButton: true,
        overlayText: false,
        centerText: true
    }, {
        name: 'Collections',
        types: 'BoxSet',
        shape: getPortraitShape(enableScrollX()),
        showTitle: true,
        overlayPlayButton: true,
        overlayText: false,
        centerText: true
    }, {
        name: 'Playlists',
        types: 'Playlist',
        shape: getSquareShape(enableScrollX()),
        preferThumb: false,
        showTitle: true,
        overlayText: false,
        showParentTitle: false,
        centerText: true,
        overlayPlayButton: true,
        coverImage: true
    }, {
        name: 'Studios',
        types: BaseItemKind.Studio,
        shape: getBackdropShape(enableScrollX()),
        preferThumb: true,
        showTitle: true,
        overlayText: false,
        centerText: true,
        overlayPlayButton: true
    }, {
        name: 'People',
        types: 'Person',
        shape: getPortraitShape(enableScrollX()),
        preferThumb: false,
        showTitle: true,
        overlayText: false,
        showParentTitle: false,
        centerText: true,
        overlayPlayButton: true,
        coverImage: true
    }, {
        name: 'Artists',
        types: 'MusicArtist',
        shape: getSquareShape(enableScrollX()),
        preferThumb: false,
        showTitle: true,
        overlayText: false,
        showParentTitle: false,
        centerText: true,
        overlayPlayButton: true,
        coverImage: true
    }, {
        name: 'Albums',
        types: 'MusicAlbum',
        shape: getSquareShape(enableScrollX()),
        preferThumb: false,
        showTitle: true,
        overlayText: false,
        showParentTitle: true,
        centerText: true,
        overlayPlayButton: true,
        coverImage: true
    }, {
        name: 'Songs',
        types: 'Audio',
        shape: getSquareShape(enableScrollX()),
        preferThumb: false,
        showTitle: true,
        overlayText: false,
        showParentTitle: true,
        centerText: true,
        overlayMoreButton: true,
        action: 'instantmix',
        coverImage: true
    }, {
        name: 'Books',
        types: 'Book',
        shape: getPortraitShape(enableScrollX()),
        showTitle: true,
        showYear: true,
        overlayPlayButton: true,
        overlayText: false,
        centerText: true
    }, {
        name: 'Channels',
        types: 'LiveTVChannel',
        shape: getBackdropShape(enableScrollX()),
        showTitle: true,
        overlayPlayButton: true,
        overlayText: false,
        centerText: true
    }, {
        name: 'HeaderPhotoAlbums',
        types: 'PhotoAlbum',
        shape: getBackdropShape(enableScrollX()),
        showTitle: true,
        overlayPlayButton: true,
        overlayText: false,
        centerText: true
    }, {
        name: 'Photos',
        types: 'Photo',
        shape: getBackdropShape(enableScrollX()),
        showTitle: true,
        overlayPlayButton: true,
        overlayText: false,
        centerText: true
    }];
}

export function getPreviewFavoriteSections(): FavoriteSection[] {
    const sections = getFullFavoriteSections();
    const preview: [string, string][] = [
        ['Movie', 'favoriteMovies'], ['Series', 'favoriteShows'],
        ['Episode', 'favoriteEpisode'], ['Video', 'favoriteVideos'],
        ['MusicArtist', 'favoriteArtists'], ['MusicAlbum', 'favoriteAlbums'],
        ['Audio', 'favoriteSongs']
    ];
    return preview.map(([type, id]) => {
        const section = sections.find(candidate => candidate.types === type)!;
        if (type === 'Movie' || type === 'Series') {
            return { ...section, id, showTitle: false, showYear: undefined, overlayText: undefined, centerText: undefined };
        }
        if (type === 'Video') {
            return { ...section, id, name: 'Videos', types: 'Video,MusicVideo' };
        }
        return { ...section, id };
    });
}

export function getFavoriteCardOptions(section: FavoriteSection): CardRenderOptions {
    return {
        preferThumb: section.preferThumb,
        shape: section.shape,
        centerText: section.centerText,
        overlayText: section.overlayText !== false,
        showTitle: section.showTitle,
        showParentTitle: section.showParentTitle,
        scalable: true,
        coverImage: section.coverImage,
        overlayPlayButton: section.overlayPlayButton,
        overlayMoreButton: section.overlayMoreButton,
        action: section.action,
        allowBottomPadding: false,
        cardLayout: false
    };
}
