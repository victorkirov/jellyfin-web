import DOMPurify from 'dompurify';
import escapeHtml from 'escape-html';
import { ItemAction } from 'constants/itemAction';
import { renderMarkdown } from 'utils/markdown';
import mediaInfo from '../mediainfo/mediainfo';
import indicators from '../indicators/indicators';
import layoutManager from '../../lib/layoutManager';
import type { ItemDto } from 'types/base/models/item-dto';
import type { CardOptions } from 'types/cardOptions';
import { getIndex, getTextLinesHtml } from './rowContent';
import { getRowImage } from './rowImage';
import { getCaptionLines } from './rowCaption';
import { getUserButtons } from './rowButtons';
import './listview.scss';
import '../buttons/emby-ratingbutton';
import '../buttons/emby-playstatebutton';

function getRowHtml(item: ItemDto, options: CardOptions, safeOverviewHtml: string, action: ItemAction, isLargeStyle: boolean, enableSideMediaInfo: boolean, enableOverview: boolean | undefined, clickEntireItem: boolean, outerTagName: string, enableContentWrapper: boolean | undefined) {
        let html = '';
        let cssClass = 'listItem';

    if (options.border || (options.highlight !== false && !layoutManager.tv)) {
        cssClass += ' listItem-border';
    }

    if (clickEntireItem) {
        cssClass += ' itemAction listItem-button';
    }

    if (layoutManager.tv) {
        cssClass += ' listItem-focusscale';
    }

    let downloadWidth = 80;

    if (isLargeStyle) {
        cssClass += ' listItem-largeImage';
        downloadWidth = 500;
    }

    if (options.imageSize === 'episode') {
        cssClass += ' listItem-episode';
        downloadWidth = 240;
    }

    const playlistItemId = item.PlaylistItemId ? (` data-playlistitemid="${item.PlaylistItemId}"`) : '';

    const positionTicksData = item.UserData?.PlaybackPositionTicks ? (` data-positionticks="${item.UserData.PlaybackPositionTicks}"`) : '';
    const playlistIdData = options.playlistId ? (` data-playlistid="${options.playlistId}"`) : '';
    const mediaTypeData = item.MediaType ? (` data-mediatype="${item.MediaType}"`) : '';
    const collectionTypeData = item.CollectionType ? (` data-collectiontype="${item.CollectionType}"`) : '';
    const channelIdData = item.ChannelId ? (` data-channelid="${item.ChannelId}"`) : '';

    if (enableContentWrapper) {
        cssClass += ' listItem-withContentWrapper';
    }

    html += `<${outerTagName} class="${cssClass}"${playlistItemId} data-action="${action}" data-isfolder="${item.IsFolder}" data-id="${item.Id}" data-serverid="${item.ServerId}" data-type="${item.Type}"${mediaTypeData}${collectionTypeData}${channelIdData}${positionTicksData}${playlistIdData}>`;

    if (enableContentWrapper) {
        html += '<div class="listItem-content">';
    }

    if (!clickEntireItem && options.dragHandle) {
        html += '<span class="listViewDragHandle material-icons listItemIcon listItemIcon-transparent drag_handle" aria-hidden="true"></span>';
    }

    if (options.image !== false) html += getRowImage(item, options, action, isLargeStyle, clickEntireItem, downloadWidth);

    if (options.showIndexNumberLeft) {
        html += '<div class="listItem-indexnumberleft">';
        html += (item.IndexNumber || '&nbsp;');
        html += '</div>';
    }

    const textlines = getCaptionLines(item, options);

    cssClass = 'listItemBody';
    if (!clickEntireItem) {
        cssClass += ' itemAction';
    }

    if (options.image === false) {
        cssClass += ' listItemBody-noleftpadding';
    }

    html += `<div class="${cssClass}">`;

    html += getTextLinesHtml(textlines, isLargeStyle);

    if (options.mediaInfo !== false && !enableSideMediaInfo) {
        const mediaInfoClass = 'secondary listItemMediaInfo listItemBodyText';

        html += `<div class="${mediaInfoClass}">`;
        html += mediaInfo.getPrimaryMediaInfoHtml(item, {
            episodeTitle: false,
            originalAirDate: false,
            subtitles: false

        });
        html += '</div>';
    }

    if (enableOverview && safeOverviewHtml) {
        html += '<div class="secondary listItem-overview listItemBodyText">';
        html += `<bdi>${safeOverviewHtml}</bdi>`;
        html += '</div>';
    }

    html += '</div>';

    if (options.mediaInfo !== false && enableSideMediaInfo) {
        html += '<div class="secondary listItemMediaInfo">';
        html += mediaInfo.getPrimaryMediaInfoHtml(item, {

            year: false,
            container: false,
            episodeTitle: false,
            criticRating: false,
            officialRating: false,
            endsAt: false

        });
        html += '</div>';
    }

    if (!options.recordButton && (item.Type === 'Timer' || item.Type === 'Program')) {
        html += indicators.getTimerIndicator(item).replace('indicatorIcon', 'indicatorIcon listItemAside');
    }

    html += '<div class="listViewUserDataButtons">';

    html += getUserButtons(item, options, clickEntireItem);

    html += '</div>';

    if (enableContentWrapper) {
        html += '</div>';

        if (enableOverview && safeOverviewHtml) {
            html += '<div class="listItem-bottomoverview secondary">';
            html += `<bdi>${safeOverviewHtml}</bdi>`;
            html += '</div>';
        }
    }

    html += `</${outerTagName}>`;
    return html;
}

export function getListViewHtml(options: CardOptions) {
    const items = options.items!;

    let groupTitle: string | number = '';
    const action = options.action || ItemAction.Link;

    const isLargeStyle = options.imageSize === 'large';
    const enableOverview = options.enableOverview;

    const clickEntireItem = layoutManager.tv;
    const outerTagName = clickEntireItem ? 'button' : 'div';
    const enableSideMediaInfo = options.enableSideMediaInfo != null ? options.enableSideMediaInfo : true;

    let outerHtml = '';

    const enableContentWrapper = options.enableOverview && !layoutManager.tv;

    for (let i = 0, length = items.length; i < length; i++) {
        const item = items[i];

        const safeOverviewHtml = enableOverview && item.Overview ?
            DOMPurify.sanitize(renderMarkdown(item.Overview)) :
            '';

        let html = '';

        if (options.showIndex) {
            const itemGroupTitle = getIndex(item, options);

            if (itemGroupTitle !== groupTitle) {
                if (html) {
                    html += '</div>';
                }

                if (i === 0) {
                    html += '<h2 class="listGroupHeader listGroupHeader-first">';
                } else {
                    html += '<h2 class="listGroupHeader">';
                }
                html += escapeHtml(String(itemGroupTitle));
                html += '</h2>';

                html += '<div>';

                groupTitle = itemGroupTitle;
            }
        }

        html += getRowHtml(item, options, safeOverviewHtml, action, isLargeStyle, enableSideMediaInfo, enableOverview, clickEntireItem, outerTagName, enableContentWrapper);

        outerHtml += html;
    }

    return outerHtml;
}

export default {
    getListViewHtml
};
