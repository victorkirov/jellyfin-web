import type { ItemDto } from 'types/base/models/item-dto';
import type { CardOptions } from 'types/cardOptions';
import escapeHtml from 'escape-html';
import { ItemAction } from 'constants/itemAction';
import layoutManager from 'lib/layoutManager';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';

export function getIndex(item: ItemDto, options: CardOptions) {
    if (options.index === 'disc') {
        return item.ParentIndexNumber == null ? '' : globalize.translate('ValueDiscNumber', item.ParentIndexNumber);
    }

    const sortBy = (options.sortBy || '').toLowerCase();
    let code;
    let name;

    if (sortBy.indexOf('sortname') === 0) {
        if (item.Type === 'Episode') {
            return '';
        }

        // SortName
        name = (item.SortName || item.Name || '?')[0].toUpperCase();

        code = name.charCodeAt(0);
        if (code < 65 || code > 90) {
            return '#';
        }

        return name.toUpperCase();
    }
    if (sortBy.indexOf('officialrating') === 0) {
        return item.OfficialRating || globalize.translate('Unrated');
    }
    if (sortBy.indexOf('communityrating') === 0) {
        if (item.CommunityRating == null) {
            return globalize.translate('Unrated');
        }

        return Math.floor(item.CommunityRating);
    }
    if (sortBy.indexOf('criticrating') === 0) {
        if (item.CriticRating == null) {
            return globalize.translate('Unrated');
        }

        return Math.floor(item.CriticRating);
    }
    if (sortBy.indexOf('albumartist') === 0) {
        // SortName
        if (!item.AlbumArtist) {
            return '';
        }

        name = item.AlbumArtist[0].toUpperCase();

        code = name.charCodeAt(0);
        if (code < 65 || code > 90) {
            return '#';
        }

        return name.toUpperCase();
    }
    return '';
}

export function getImageUrl(item: ItemDto, size: number) {
    const apiClient = ServerConnections.getApiClient(item.ServerId);
    let itemId;

    const options: { fillWidth: number; fillHeight: number; type: string; tag?: string } = {
        fillWidth: size,
        fillHeight: size,
        type: 'Primary'
    };

    if (item.ImageTags?.Primary) {
        options.tag = item.ImageTags.Primary;
        itemId = item.Id;
    } else if (item.AlbumId && item.AlbumPrimaryImageTag) {
        options.tag = item.AlbumPrimaryImageTag;
        itemId = item.AlbumId;
    } else if (item.SeriesId && item.SeriesPrimaryImageTag) {
        options.tag = item.SeriesPrimaryImageTag;
        itemId = item.SeriesId;
    } else if (item.ParentPrimaryImageTag) {
        options.tag = item.ParentPrimaryImageTag;
        itemId = item.ParentPrimaryImageItemId;
    }

    if (itemId) {
        return apiClient!.getScaledImageUrl(itemId, options);
    }
    return null;
}

export function getChannelImageUrl(item: ItemDto, size: number) {
    const apiClient = ServerConnections.getApiClient(item.ServerId);
    const options: { fillWidth: number; fillHeight: number; type: string; tag?: string } = {
        fillWidth: size,
        fillHeight: size,
        type: 'Primary'
    };

    if (item.ChannelId && item.ChannelPrimaryImageTag) {
        options.tag = item.ChannelPrimaryImageTag;
    }

    if (item.ChannelId) {
        return apiClient!.getScaledImageUrl(item.ChannelId, options);
    }
}

export function getTextLinesHtml(textlines: (string | null | undefined)[], isLargeStyle: boolean) {
    let html = '';

    const largeTitleTagName = layoutManager.tv ? 'h2' : 'div';

    for (const [i, text] of textlines.entries()) {
        if (!text) {
            continue;
        }

        let elem;

        if (i === 0) {
            if (isLargeStyle) {
                elem = document.createElement(largeTitleTagName);
            } else {
                elem = document.createElement('div');
            }
        } else {
            elem = document.createElement('div');
            elem.classList.add('secondary');
        }

        elem.classList.add('listItemBodyText');

        elem.innerHTML = '<bdi>' + escapeHtml(text) + '</bdi>';

        html += elem.outerHTML;
    }

    return html;
}

export function getRightButtonsHtml(options: CardOptions) {
    let html = '';

    for (let i = 0, length = options.rightButtons!.length; i < length; i++) {
        const button = options.rightButtons![i];

        html += `<button is="paper-icon-button-light" class="listItemButton itemAction" data-action="${ItemAction.Custom}" data-customaction="${button.id}" title="${button.title}"><span class="material-icons ${button.icon}" aria-hidden="true"></span></button>`;
    }

    return html;
}

