import type { ItemDto } from 'types/base/models/item-dto';
import type { CardOptions } from 'types/cardOptions';
import escapeHtml from 'escape-html';
import globalize from 'lib/globalize';
import { ServerConnections } from 'lib/jellyfin-apiclient';

function getNameIndex(name: string) {
    const initial = name[0].toUpperCase();
    const code = initial.charCodeAt(0);
    return code < 65 || code > 90 ? '#' : initial;
}

/** @returns Numeric rating keys or text labels, kept distinct by strict group comparisons. */
export function getIndex(item: ItemDto, options: CardOptions): string | number {
    if (options.index === 'disc') {
        return item.ParentIndexNumber == null ? '' : globalize.translate('ValueDiscNumber', item.ParentIndexNumber);
    }
    const sortBy = (options.sortBy || '').toLowerCase();
    if (sortBy.startsWith('sortname')) {
        return item.Type === 'Episode' ? '' : getNameIndex(item.SortName || item.Name || '?');
    }
    if (sortBy.startsWith('officialrating')) return item.OfficialRating || globalize.translate('Unrated');
    if (sortBy.startsWith('communityrating')) return item.CommunityRating == null ? globalize.translate('Unrated') : Math.floor(item.CommunityRating);
    if (sortBy.startsWith('criticrating')) return item.CriticRating == null ? globalize.translate('Unrated') : Math.floor(item.CriticRating);
    if (sortBy.startsWith('albumartist') && item.AlbumArtist) return getNameIndex(item.AlbumArtist);
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

    const largeTitleTagName = 'h2';

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

