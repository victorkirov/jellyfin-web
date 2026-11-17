import cardBuilder from 'components/cardbuilder/cardBuilder';
import listView from 'components/listview/listview';
import type { LibraryQuery, LibraryResult } from './libraryControllerTypes';

type RenderingOptions = { viewStyle: string | undefined; query: LibraryQuery; result: LibraryResult };

export function getCollectionsHtml({ viewStyle, query, result }: RenderingOptions) {
    let html;
    if (viewStyle == 'Thumb') {
        html = cardBuilder.getCardsHtml({
            items: result.Items,
            shape: 'backdrop',
            preferThumb: true,
            context: 'movies',
            overlayPlayButton: true,
            centerText: true,
            showTitle: true
        });
    } else if (viewStyle == 'ThumbCard') {
        html = cardBuilder.getCardsHtml({
            items: result.Items,
            shape: 'backdrop',
            preferThumb: true,
            context: 'movies',
            lazy: true,
            cardLayout: true,
            showTitle: true
        });
    } else if (viewStyle == 'Banner') {
        html = cardBuilder.getCardsHtml({
            items: result.Items,
            shape: 'banner',
            preferBanner: true,
            context: 'movies',
            lazy: true
        });
    } else if (viewStyle == 'List') {
        html = listView.getListViewHtml({
            items: result.Items,
            context: 'movies',
            sortBy: query.SortBy
        });
    } else if (viewStyle == 'PosterCard') {
        html = cardBuilder.getCardsHtml({
            items: result.Items,
            shape: 'auto',
            context: 'movies',
            showTitle: true,
            centerText: false,
            cardLayout: true
        });
    } else {
        html = cardBuilder.getCardsHtml({
            items: result.Items,
            shape: 'auto',
            context: 'movies',
            centerText: true,
            overlayPlayButton: true,
            showTitle: true
        });
    }

    return html;
}

export function getAlbumsHtml({ viewStyle, query, result }: RenderingOptions) {
    let html;
    if (viewStyle == 'List') {
        html = listView.getListViewHtml({
            items: result.Items,
            context: 'music',
            sortBy: query.SortBy
        });
    } else if (viewStyle == 'PosterCard') {
        html = cardBuilder.getCardsHtml({
            items: result.Items,
            shape: 'square',
            context: 'music',
            showTitle: true,
            coverImage: true,
            showParentTitle: true,
            lazy: true,
            cardLayout: true
        });
    } else {
        html = cardBuilder.getCardsHtml({
            items: result.Items,
            shape: 'square',
            context: 'music',
            showTitle: true,
            showParentTitle: true,
            lazy: true,
            centerText: true,
            overlayPlayButton: true
        });
    }

    return html;
}

export function getArtistsHtml({ viewStyle, query, result }: RenderingOptions) {
    let html;
    if (viewStyle == 'List') {
        html = listView.getListViewHtml({
            items: result.Items,
            sortBy: query.SortBy
        });
    } else if (viewStyle == 'PosterCard') {
        html = cardBuilder.getCardsHtml({
            items: result.Items,
            shape: 'square',
            context: 'music',
            showTitle: true,
            coverImage: true,
            cardLayout: true
        });
    } else {
        html = cardBuilder.getCardsHtml({
            items: result.Items,
            shape: 'square',
            context: 'music',
            showTitle: true,
            coverImage: true,
            lazy: true,
            centerText: true,
            overlayPlayButton: true
        });
    }
    return html;
}

export function getEpisodesHtml({ viewStyle, query, result }: RenderingOptions) {
    let html;
    if (viewStyle == 'List') {
        html = listView.getListViewHtml({
            items: result.Items,
            sortBy: query.SortBy,
            showParentTitle: true
        });
    } else if (viewStyle == 'PosterCard') {
        html = cardBuilder.getCardsHtml({
            items: result.Items,
            shape: 'backdrop',
            showTitle: true,
            showParentTitle: true,
            scalable: true,
            cardLayout: true
        });
    } else {
        html = cardBuilder.getCardsHtml({
            items: result.Items,
            shape: 'backdrop',
            showTitle: true,
            showParentTitle: true,
            overlayText: false,
            centerText: true,
            scalable: true,
            overlayPlayButton: true
        });
    }
    return html;
}

