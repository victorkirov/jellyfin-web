import escapeHtml from 'escape-html';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import cardBuilder from 'components/cardbuilder/cardBuilder';
import { getBackdropShape, getPortraitShape } from 'components/cardbuilder/utils/shape';
import layoutManager from 'lib/layoutManager';
import { appRouter } from 'components/router/appRouter';
import globalize from 'lib/globalize';

export type GenreOptions = {
    itemType: string;
    queryKey: string;
    context: string;
    restoreSavedView?: boolean;
    posterBottomPadding?: boolean;
};
export type GenreParams = { topParentId?: string };

function enableScrollX() {
    return true;
}

export function buildGenreCards(elem: HTMLElement, items: BaseItemDto[], viewStyle: string, options: GenreOptions) {
    if (viewStyle == 'Thumb') {
        cardBuilder.buildCards(items, {
            itemsContainer: elem,
            shape: getBackdropShape(enableScrollX()),
            preferThumb: true,
            showTitle: true,
            scalable: true,
            centerText: true,
            overlayMoreButton: true,
            allowBottomPadding: false
        });
    } else if (viewStyle == 'ThumbCard') {
        cardBuilder.buildCards(items, {
            itemsContainer: elem,
            shape: getBackdropShape(enableScrollX()),
            preferThumb: true,
            showTitle: true,
            scalable: true,
            centerText: false,
            cardLayout: true,
            showYear: true
        });
    } else if (viewStyle == 'PosterCard') {
        cardBuilder.buildCards(items, {
            itemsContainer: elem,
            shape: getPortraitShape(enableScrollX()),
            showTitle: true,
            scalable: true,
            centerText: false,
            cardLayout: true,
            showYear: true
        });
    } else if (viewStyle == 'Poster') {
        cardBuilder.buildCards(items, {
            itemsContainer: elem,
            shape: getPortraitShape(enableScrollX()),
            scalable: true,
            overlayMoreButton: true,
            allowBottomPadding: options.posterBottomPadding,
            showTitle: true,
            centerText: true,
            showYear: true
        });
    }
}

export function getGenreRowsHtml(items: BaseItemDto[], params: GenreParams, options: GenreOptions) {
    let html = '';

    for (let i = 0, length = items.length; i < length; i++) {
        const item = items[i];

        html += '<div class="verticalSection">';
        html += '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left">';
        html += '<a is="emby-linkbutton" href="' + appRouter.getRouteUrl(item, {
            context: options.context,
            parentId: params.topParentId
        }) + '" class="more button-flat button-flat-mini sectionTitleTextButton btnMoreFromGenre' + item.Id + '">';
        html += '<h2 class="sectionTitle sectionTitle-cards">';
        html += escapeHtml(item.Name || '');
        html += '</h2>';
        html += '<span class="material-icons hide chevron_right" aria-hidden="true"></span>';
        html += '</a>';
        html += '</div>';
        if (enableScrollX()) {
            let scrollXClass = 'scrollX hiddenScrollX';

            if (layoutManager.tv) {
                scrollXClass += ' smoothScrollX padded-top-focusscale padded-bottom-focusscale';
            }

            html += '<div is="emby-itemscontainer" class="itemsContainer ' + scrollXClass + ' lazy padded-left padded-right" data-id="' + item.Id + '">';
        } else {
            html += '<div is="emby-itemscontainer" class="itemsContainer vertical-wrap lazy padded-left padded-right" data-id="' + item.Id + '">';
        }

        html += '</div>';
        html += '</div>';
    }

    if (!items.length) {
        html = '';

        html += '<div class="noItemsMessage centerMessage">';
        html += '<h1>' + globalize.translate('MessageNothingHere') + '</h1>';
        html += '<p>' + globalize.translate('MessageNoGenresAvailable') + '</p>';
        html += '</div>';
    }

    return html;
}
