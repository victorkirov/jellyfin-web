import type { ItemDto } from 'types/base/models/item-dto';
import type { CardOptions } from 'types/cardOptions';
import { ItemAction } from 'constants/itemAction';
import indicators from '../indicators/indicators';
import cardBuilder from '../cardbuilder/cardBuilder';
import { getDefaultBackgroundClass } from '../cardbuilder/utils/builder';
import { getChannelImageUrl, getImageUrl } from './rowContent';

export function getRowImage(item: ItemDto, options: CardOptions, action: ItemAction, isLargeStyle: boolean, downloadWidth: number) {
    let html = '';

    const imgUrl = options.imageSource === 'channel' ? getChannelImageUrl(item, downloadWidth) : getImageUrl(item, downloadWidth);
    let imageClass = isLargeStyle ? 'listItemImage listItemImage-large' : 'listItemImage';

    if (options.imageSource === 'channel') {
        imageClass += ' listItemImage-channel';
    }

    if (isLargeStyle) {
        imageClass += ' listItemImage-large-tv';
    }

    if (imgUrl) {
        html += '<div data-action="' + action + '" class="' + imageClass + ' lazy" data-src="' + imgUrl + '" item-icon>';
    } else {
        html += '<div class="' + imageClass + ' cardImageContainer ' + getDefaultBackgroundClass(item.Name) + '">' + cardBuilder.getDefaultText(item, options);
    }

    const mediaSourceCount = item.MediaSourceCount || 1;
    if (mediaSourceCount > 1 && options.disableIndicators !== true) {
        html += '<div class="mediaSourceIndicator">' + mediaSourceCount + '</div>';
    }

    let indicatorsHtml = '';
    indicatorsHtml += indicators.getPlayedIndicatorHtml(item);

    if (indicatorsHtml) {
        html += `<div class="indicators listItemIndicators">${indicatorsHtml}</div>`;
    }

    const progressHtml = indicators.getProgressBarHtml(item, {
        containerClass: 'listItemProgressBar'
    });

    if (progressHtml) {
        html += progressHtml;
    }
    html += '</div>';
    return html;
}
