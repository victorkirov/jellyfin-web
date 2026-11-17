import type { ItemDto } from 'types/base/models/item-dto';
import type { CardOptions } from 'types/cardOptions';
import type { CardShape } from './utils/shape';
import type { ApiClient } from 'jellyfin-apiclient';
import type { Api } from '@jellyfin/sdk';
import type { CardItem, CardRenderOptions, CardRenderContext } from './cardTypes';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import escapeHtml from 'escape-html';
import { ItemAction } from 'constants/itemAction';
import browser from 'scripts/browser';
import { getItemTypeIcon, getLibraryIcon } from 'utils/image';
import indicators from '../indicators/indicators';
import itemHelper from '../itemHelper';
import layoutManager from '../../lib/layoutManager';
import { appRouter } from '../router/appRouter';
import { isUsingLiveTvNaming, resolveAction, resolveCardBoxCssClasses, resolveCardCssClasses, resolveCardImageContainerCssClasses, resolveMixedShapeByAspectRatio } from './utils/builder';
import { getCardImageUrl } from './utils/url';
import { getCardFooterText } from './cardCaptions';

const enableFocusTransform = !browser.slow && !browser.edge;

let refreshIndicatorLoaded: boolean | undefined;

/**
 * Imports the refresh indicator element.
 */
function importRefreshIndicator() {
    if (!refreshIndicatorLoaded) {
        refreshIndicatorLoaded = true;
        void import('../../elements/emby-itemrefreshindicator/emby-itemrefreshindicator');
    }
}

type FooterContext = Omit<CardRenderContext, 'apiClient'> & { apiClient?: ApiClient; imgUrl?: string; forceName: boolean };

function getCardLogo(context: FooterContext): string | null | undefined {
    const { item, options, apiClient } = context;

    const logoHeight = 40;

    if (options.showChannelLogo && item.ChannelPrimaryImageTag) {
        return apiClient!.getScaledImageUrl(item.ChannelId!, {
            type: 'Primary',
            height: logoHeight,
            tag: item.ChannelPrimaryImageTag
        });
    } else if (options.showLogo && item.ParentLogoImageTag) {
        return apiClient!.getScaledImageUrl(item.ParentLogoItemId!, {
            type: 'Logo',
            height: logoHeight,
            tag: item.ParentLogoImageTag
        });
    }

    return undefined;
}

function getCardFooters(context: FooterContext) {
    const { item, options, imgUrl, forceName } = context;
    const overlayText = options.overlayText;
    let footerCssClass;
    let progressHtml = indicators.getProgressBarHtml(item);

    let innerCardFooter = '';

    let logoUrl = getCardLogo(context);

    if (overlayText) {
        logoUrl = null;

        footerCssClass = progressHtml ? 'innerCardFooter fullInnerCardFooter' : 'innerCardFooter';
        innerCardFooter += getCardFooterText({ item, options, footerClass: footerCssClass, progressHtml, forceName, overlayText, isOuterFooter: false, imgUrl, logoUrl });
    } else if (progressHtml) {
        innerCardFooter += '<div class="innerCardFooter fullInnerCardFooter innerCardFooterClear">';
        innerCardFooter += progressHtml;
        innerCardFooter += '</div>';

        progressHtml = '';
    }

    const mediaSourceCount = item.MediaSourceCount || 1;
    if (mediaSourceCount > 1 && options.disableIndicators !== true) {
        innerCardFooter += '<div class="mediaSourceIndicator">' + mediaSourceCount + '</div>';
    }

    let outerCardFooter = '';
    if (!overlayText) {
        footerCssClass = options.cardLayout ? 'cardFooter' : 'cardFooter cardFooter-transparent';

        if (logoUrl) {
            footerCssClass += ' cardFooter-withlogo';
        }

        if (!options.cardLayout) {
            logoUrl = null;
        }

        outerCardFooter = getCardFooterText({ item, options, footerClass: footerCssClass, progressHtml, forceName, overlayText, isOuterFooter: true, imgUrl, logoUrl });
    }

    return { innerCardFooter, outerCardFooter };
}

function getCardIndicators(item: CardItem, options: CardRenderOptions) {
    if (options.disableIndicators === true) {
        return '';
    }
    let indicatorsHtml = '';

    if (options.missingIndicator !== false) {
        indicatorsHtml += indicators.getMissingIndicator(item);
    }

    indicatorsHtml += indicators.getSyncIndicator(item);
    indicatorsHtml += indicators.getTimerIndicator(item);

    indicatorsHtml += indicators.getTypeIndicator(item);

    if (options.showGroupCount) {
        indicatorsHtml += indicators.getChildCountIndicatorHtml(item, {
            minCount: 1
        });
    } else {
        indicatorsHtml += indicators.getPlayedIndicatorHtml(item);
    }

    if (item.Type === BaseItemKind.CollectionFolder || item.CollectionType) {
        const refreshClass = item.RefreshProgress ? '' : ' class="hide"';
        indicatorsHtml += '<div is="emby-itemrefreshindicator"' + refreshClass + ' data-progress="' + (item.RefreshProgress || 0) + '" data-status="' + item.RefreshStatus + '"></div>';
        importRefreshIndicator();
    }

    return indicatorsHtml ? '<div class="cardIndicators">' + indicatorsHtml + '</div>' : '';
}

function getCardDataAttributes(item: CardItem, options: CardRenderOptions) {
    const positionTicksData = item.UserData?.PlaybackPositionTicks ? (' data-positionticks="' + item.UserData.PlaybackPositionTicks + '"') : '';
    const playlistIdData = options.playlistId ? (' data-playlistid="' + options.playlistId + '"') : '';
    const mediaTypeData = item.MediaType ? (' data-mediatype="' + item.MediaType + '"') : '';
    const collectionTypeData = item.CollectionType ? (' data-collectiontype="' + item.CollectionType + '"') : '';
    const channelIdData = item.ChannelId ? (' data-channelid="' + item.ChannelId + '"') : '';
    const pathData = item.Path ? (' data-path="' + escapeHtml(item.Path) + '"') : '';
    const contextData = options.context ? (' data-context="' + options.context + '"') : '';
    const parentIdData = options.parentId ? (' data-parentid="' + options.parentId + '"') : '';
    const startDate = item.StartDate ? (' data-startdate="' + item.StartDate.toString() + '"') : '';
    const endDate = item.EndDate ? (' data-enddate="' + item.EndDate.toString() + '"') : '';

    return mediaTypeData + collectionTypeData + channelIdData + pathData + positionTicksData + playlistIdData + contextData + parentIdData + startDate + endDate;
}

function getImageContainerOpen(item: CardItem, action: ItemAction, cardImageContainerClasses: string, imgUrl: string | undefined, blurhashAttrib: string) {
    const cardContentClass = 'cardContent';
    if (layoutManager.tv) {
        // Don't use the IMG tag with safari because it puts a white border around it
        return imgUrl ? ('<div class="' + cardImageContainerClasses + ' ' + cardContentClass + ' lazy" data-src="' + imgUrl + '" ' + blurhashAttrib + '>') : ('<div class="' + cardImageContainerClasses + ' ' + cardContentClass + '">');
    } else {
        const cardImageContainerAriaLabelAttribute = ` aria-label="${escapeHtml(item.Name)}" role="img"`;

        const url = appRouter.getRouteUrl(item);
        // Don't use the IMG tag with safari because it puts a white border around it
        return imgUrl ? ('<a href="' + url + '" data-action="' + action + '" class="' + cardImageContainerClasses + ' ' + cardContentClass + ' itemAction lazy" data-src="' + imgUrl + '" ' + blurhashAttrib + cardImageContainerAriaLabelAttribute + '>') : ('<a href="' + url + '" data-action="' + action + '" class="' + cardImageContainerClasses + ' ' + cardContentClass + ' itemAction"' + cardImageContainerAriaLabelAttribute + '>');
    }
}

/**
 * Builds the HTML markup for an individual card.
 * @param {number} index - Index of the card
 * @param {object} item - Item used to generate the card.
 * @param {object} apiClient - API client instance.
 * @param {object} options - Options used to generate the card.
 * @param {object} api - SDK API instance.
 * @param {string} secondaryCaptionClass - Batch caption sizing class.
 * @returns {string} HTML markup for the generated card.
 */
export function buildCard(index: number, item: CardItem, apiClient: ApiClient | undefined, options: CardRenderOptions, api: Api | undefined, secondaryCaptionClass: string) {
    const action = resolveAction({
        defaultAction: (options.action || ItemAction.Link) as ItemAction,
        isFolder: !!item.IsFolder,
        isPhoto: item.MediaType === 'Photo'
    });

    let shape = options.shape;

    if (shape === 'mixed') {
        shape = resolveMixedShapeByAspectRatio(item.PrimaryImageAspectRatio);
    }

    // TODO move card creation code to Card component

    // Legacy crew cards also pass person-role names through the item type.
    const imgInfo = getCardImageUrl({ api, item: item as ItemDto, options: options as CardOptions, shape: shape as CardShape });
    const imgUrl = imgInfo.imgUrl;
    const blurhash = imgInfo.blurhash;
    const forceName = imgInfo.forceName;

    const cardImageContainerClasses = resolveCardImageContainerCssClasses({
        itemType: item.Type!,
        itemName: item.Name || undefined,
        hasCoverImage: options.coverImage || imgInfo.coverImage,
        imgUrl
    });

    const { innerCardFooter, outerCardFooter } = getCardFooters({ item, options, apiClient, imgUrl, forceName });

    const cardBoxClass = resolveCardBoxCssClasses({
        hasOuterCardFooter: outerCardFooter.length > 0,
        cardLayout: !!options.cardLayout
    });

    // cardBox can be it's own separate element if an outer footer is ever needed
    let cardImageContainerOpen;
    let cardImageContainerClose = '';
    let cardBoxClose = '';
    let cardScalableClose = '';

    let blurhashAttrib = '';
    if (blurhash && blurhash.length > 0) {
        blurhashAttrib = 'data-blurhash="' + blurhash + '"';
    }

    cardImageContainerOpen = getImageContainerOpen(item, action, cardImageContainerClasses, imgUrl, blurhashAttrib);
    cardImageContainerClose = layoutManager.tv ? '</div>' : '</a>';

    const cardScalableClass = 'cardScalable';

    let cardPadderIcon = '';

    // TV Channel logos are transparent so skip the placeholder to avoid overlapping
    if (imgUrl && item.Type !== 'TvChannel') {
        // Always use an icon unless the caller overrides it.
        cardPadderIcon = getDefaultText(item, options, 'folder');
    }

    cardImageContainerOpen = `<div class="${cardBoxClass}"><div class="${cardScalableClass}"><div class="cardPadder cardPadder-${shape}">${cardPadderIcon}</div>${cardImageContainerOpen}`;
    cardBoxClose = '</div>';
    cardScalableClose = '</div>';

    cardImageContainerOpen += getCardIndicators(item, options);

    if (!imgUrl) {
        cardImageContainerOpen += getDefaultText(item, options);
    }

    const tagName = layoutManager.tv ? 'button' : 'div';

    const nameWithPrefix = (item.SortName || item.Name || '');
    let prefix = nameWithPrefix.substring(0, Math.min(3, nameWithPrefix.length));

    if (prefix) {
        prefix = prefix.toUpperCase();
    }

    let timerAttributes = '';
    if (item.TimerId) {
        timerAttributes += ' data-timerid="' + item.TimerId + '"';
    }
    if (item.SeriesTimerId) {
        timerAttributes += ' data-seriestimerid="' + item.SeriesTimerId + '"';
    }

    let actionAttribute;
    let ariaLabelAttribute = '';

    if (tagName === 'button') {
        actionAttribute = ' data-action="' + action + '"';
        ariaLabelAttribute = ` aria-label="${escapeHtml(item.Name)}"`;
    } else {
        actionAttribute = '';
    }

    const className = resolveCardCssClasses({
        shape: shape || undefined,
        cardCssClass: options.cardCssClass || undefined,
        cardClass: options.cardClass || undefined,
        isTV: layoutManager.tv,
        enableFocusTransform: enableFocusTransform,
        showChildCountIndicator: !!options.showChildCountIndicator,
        childCount: item.ChildCount ?? undefined,
        tagName: tagName,
        itemType: item.Type!
    }) + secondaryCaptionClass;

    const itemDataAttributes = getCardDataAttributes(item, options);

    return '<' + tagName + ' data-index="' + index + '"' + timerAttributes + actionAttribute + ' data-isfolder="' + (item.IsFolder || false) + '" data-serverid="' + (item.ServerId || options.serverId) + '" data-id="' + (item.Id || item.ItemId) + '" data-type="' + item.Type + '"' + itemDataAttributes + ' data-prefix="' + escapeHtml(prefix) + '" class="' + className + '"' + ariaLabelAttribute + '>' + cardImageContainerOpen + innerCardFooter + cardImageContainerClose + cardScalableClose + outerCardFooter + cardBoxClose + '</' + tagName + '>';
}

/**
 * Generates the text or icon used for default card backgrounds.
 * @param {object} item - Item used to generate the card overlay.
 * @param {object} options - Options used to generate the card overlay.
 * @param {string} [defaultCardImageIcon] - Fallback icon when no option is supplied.
 * @returns {string} HTML markup of the card overlay.
 */
export function getDefaultText(item: CardItem, options?: CardRenderOptions, defaultCardImageIcon?: string) {
    let icon;

    if (item.Type === BaseItemKind.CollectionFolder || item.CollectionType) {
        icon = getLibraryIcon(item.CollectionType);
    }

    if (!icon) {
        const iconName = options && 'defaultCardImageIcon' in options ? options.defaultCardImageIcon : defaultCardImageIcon;
        icon = getItemTypeIcon(item.Type, iconName);
    }

    if (icon) {
        return `<span class="cardImageIcon material-icons ${icon}" aria-hidden="true"></span>`;
    }

    const defaultName = isUsingLiveTvNaming(item.Type) ? item.Name : itemHelper.getDisplayName(item);
    return '<div class="cardText cardDefaultText">' + escapeHtml(defaultName) + '</div>';
}

