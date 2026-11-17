import type { ItemDto } from 'types/base/models/item-dto';
import type { CardOptions } from 'types/cardOptions';
import { ItemAction } from 'constants/itemAction';
import layoutManager from 'lib/layoutManager';
import globalize from 'lib/globalize';
import indicators from '../indicators/indicators';
import cardBuilder from '../cardbuilder/cardBuilder';
import { getDefaultBackgroundClass } from '../cardbuilder/utils/builder';
import { getChannelImageUrl, getImageUrl } from './rowContent';

export function getRowImage(item: ItemDto, options: CardOptions, action: ItemAction, isLargeStyle: boolean, clickEntireItem: boolean, downloadWidth: number) {
    let html = '';

    const imgUrl = options.imageSource === 'channel' ? getChannelImageUrl(item, downloadWidth) : getImageUrl(item, downloadWidth);
    let imageClass = isLargeStyle ? 'listItemImage listItemImage-large' : 'listItemImage';

    if (options.imageSource === 'channel') {
        imageClass += ' listItemImage-channel';
    }

    if (isLargeStyle && layoutManager.tv) {
        imageClass += ' listItemImage-large-tv';
    }

    const playOnImageClick = options.imagePlayButton && !layoutManager.tv;

    if (!clickEntireItem) {
        imageClass += ' itemAction';
    }

    const imageAction = playOnImageClick ? ItemAction.Link : action;

    if (imgUrl) {
        html += '<div data-action="' + imageAction + '" class="' + imageClass + ' lazy" data-src="' + imgUrl + '" item-icon>';
    } else {
        html += '<div class="' + imageClass + ' cardImageContainer ' + getDefaultBackgroundClass(item.Name) + '">' + cardBuilder.getDefaultText(item, options, undefined);
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

    if (playOnImageClick) {
        html += `<button is="paper-icon-button-light" class="listItemImageButton itemAction" data-action="${ItemAction.Resume}" title="${globalize.translate('Play')}"><span class="material-icons listItemImageButton-icon play_arrow" aria-hidden="true"></span></button>`;
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
