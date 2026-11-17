import DOMPurify from 'dompurify';
import escapeHtml from 'escape-html';
import { ItemAction } from 'constants/itemAction';
import { renderMarkdown } from 'utils/markdown';
import mediaInfo from '../mediainfo/mediainfo';
import indicators from '../indicators/indicators';
import type { ItemDto } from 'types/base/models/item-dto';
import type { CardOptions } from 'types/cardOptions';
import { getIndex, getTextLinesHtml } from './rowContent';
import { getRowImage } from './rowImage';
import { getCaptionLines } from './rowCaption';
import './listview.scss';

type RowContext = {
    action: ItemAction;
    isLargeStyle: boolean;
    enableSideMediaInfo: boolean;
    enableOverview?: boolean;
};

function getRowBody(item: ItemDto, options: CardOptions, context: RowContext, safeOverviewHtml: string) {
    const { isLargeStyle, enableSideMediaInfo, enableOverview } = context;
    let html = '';
    const textlines = getCaptionLines(item, options);

    let cssClass = 'listItemBody';
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

    return html;
}

function getRowHtml(item: ItemDto, options: CardOptions, context: RowContext, safeOverviewHtml: string) {
    const { action, isLargeStyle } = context;
    let html = '';
    let cssClass = 'listItem';

    if (options.border) {
        cssClass += ' listItem-border';
    }

    cssClass += ' itemAction listItem-button listItem-focusscale';

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

    html += `<button class="${cssClass}"${playlistItemId} data-action="${action}" data-isfolder="${item.IsFolder}" data-id="${item.Id}" data-serverid="${item.ServerId}" data-type="${item.Type}"${mediaTypeData}${collectionTypeData}${channelIdData}${positionTicksData}${playlistIdData}>`;

    if (options.image !== false) html += getRowImage(item, options, action, isLargeStyle, downloadWidth);

    if (options.showIndexNumberLeft) {
        html += '<div class="listItem-indexnumberleft">';
        html += (item.IndexNumber || '&nbsp;');
        html += '</div>';
    }

    html += getRowBody(item, options, context, safeOverviewHtml);

    if (!options.recordButton && (item.Type === 'Timer' || item.Type === 'Program')) {
        html += indicators.getTimerIndicator(item).replace('indicatorIcon', 'indicatorIcon listItemAside');
    }

    html += '<div class="listViewUserDataButtons">';

    html += '</div>';

    html += '</button>';
    return html;
}

function getGroupHeaderHtml(title: string | number, first: boolean) {
    const cssClass = first ? 'listGroupHeader listGroupHeader-first' : 'listGroupHeader';
    return `<h2 class="${cssClass}">${escapeHtml(String(title))}</h2><div>`;
}

export function getListViewHtml(options: CardOptions) {
    const items = options.items!;

    let groupTitle: string | number = '';
    const action = options.action || ItemAction.Link;

    const isLargeStyle = options.imageSize === 'large';
    const enableOverview = options.enableOverview;

    const context: RowContext = {
        action, isLargeStyle, enableOverview,
        enableSideMediaInfo: options.enableSideMediaInfo != null ? options.enableSideMediaInfo : true
    };

    let outerHtml = '';

    for (let i = 0, length = items.length; i < length; i++) {
        const item = items[i];

        const safeOverviewHtml = enableOverview && item.Overview ?
            DOMPurify.sanitize(renderMarkdown(item.Overview)) :
            '';

        let html = '';

        if (options.showIndex) {
            const itemGroupTitle = getIndex(item, options);

            if (itemGroupTitle !== groupTitle) {
                html += getGroupHeaderHtml(itemGroupTitle, i === 0);

                groupTitle = itemGroupTitle;
            }
        }

        html += getRowHtml(item, options, context, safeOverviewHtml);

        outerHtml += html;
    }

    return outerHtml;
}

export default {
    getListViewHtml
};
