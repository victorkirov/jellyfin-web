import type { ApiClient } from 'jellyfin-apiclient';
import type { Api } from '@jellyfin/sdk';
import type { CardItem, CardRenderOptions } from './cardTypes';
import datetime from 'scripts/datetime';
import dom from 'utils/dom';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import focusManager from '../../lib/focusManager';
import imageLoader from '../images/imageLoader';
import layoutManager from '../../lib/layoutManager';
import 'elements/emby-button/paper-icon-button-light';
import './card.scss';
import '../guide/programs.scss';
import { getDesiredAspect, getPostersPerRow, isResizable, isUsingLiveTvNaming } from './utils/builder';
import { getBackdropShape, getPortraitShape, getSquareShape } from './utils/shape';
import { buildCard, getDefaultText } from './cardMarkup';
import { onUserDataChanged, onTimerCreated, onTimerCancelled, onSeriesTimerCancelled } from './cardDomUpdates';

export { getDefaultText, onUserDataChanged, onTimerCreated, onTimerCancelled, onSeriesTimerCancelled };

/**
 * Generate the HTML markup for cards for a set of items.
 * @param items - The items used to generate cards.
 * @param [options] - The options of the cards.
 * @returns {string} The HTML markup for the cards.
 */
export function getCardsHtml(items: CardItem[], options: CardRenderOptions): string;
export function getCardsHtml(options: CardRenderOptions): string;
export function getCardsHtml(items: CardItem[] | CardRenderOptions, options?: CardRenderOptions): string {
    if (!Array.isArray(items)) {
        return buildCardsHtmlInternal(items.items!, items);
    }
    return buildCardsHtmlInternal(items, options!);
}

/**
 * Gets the width of a card's image according to the shape and amount of cards per row.
 * @param {string} shape - Shape of the card.
 * @param {number} screenWidth - Width of the screen.
 * @param {boolean} isOrientationLandscape - Flag for the orientation of the screen.
 * @returns {number} Width of the image for a card.
 */
function getImageWidth(shape: string, screenWidth: number, isOrientationLandscape: boolean) {
    const imagesPerRow = getPostersPerRow(shape, screenWidth, isOrientationLandscape, layoutManager.tv);
    return Math.round(screenWidth / imagesPerRow);
}

/**
 * Normalizes the options for a card.
 * @param {Object} items - A set of items.
 * @param {Object} options - Options for handling the items.
 */
export function setCardData(items: CardItem[], options: CardRenderOptions) {
    options.shape = options.shape || 'auto';

    const primaryImageAspectRatio = imageLoader.getPrimaryImageAspectRatio(items);

    if (['auto', 'autohome', 'autooverflow', 'autoVertical'].includes(options.shape)) {
        const requestedShape = options.shape;
        options.shape = null;

        setAutoShape(options, primaryImageAspectRatio, requestedShape);

        if (!options.shape) {
            options.shape = options.defaultShape || getSquareShape(requestedShape === 'autooverflow');
        }
    }

    if (options.preferThumb === 'auto') {
        options.preferThumb = options.shape === 'backdrop' || options.shape === 'overflowBackdrop';
    }

    options.uiAspect = getDesiredAspect(options.shape);
    options.primaryImageAspectRatio = primaryImageAspectRatio;

    if (!options.width && options.widths) {
        options.width = options.widths[options.shape];
    }

    if (options.rows && typeof (options.rows) !== 'number') {
        options.rows = options.rows[options.shape];
    }

    if (!options.width) {
        let screenWidth = dom.getWindowSize().innerWidth;
        const screenHeight = dom.getWindowSize().innerHeight;

        if (isResizable(screenWidth)) {
            const roundScreenTo = 100;
            screenWidth = Math.floor(screenWidth / roundScreenTo) * roundScreenTo;
        }

        options.width = getImageWidth(options.shape, screenWidth, screenWidth > (screenHeight * 1.3));
    }
}

function setAutoShape(options: CardRenderOptions, primaryImageAspectRatio: number | null | undefined, requestedShape: string) {
    if (primaryImageAspectRatio) {
        if (primaryImageAspectRatio >= 3) {
            options.shape = 'banner';
            options.coverImage = true;
        } else if (primaryImageAspectRatio >= 1.33) {
            options.shape = getBackdropShape(requestedShape === 'autooverflow');
        } else if (primaryImageAspectRatio > 0.8) {
            options.shape = getSquareShape(requestedShape === 'autooverflow');
        } else {
            options.shape = getPortraitShape(requestedShape === 'autooverflow');
        }
    }
}

function getSecondaryCaptionClass(items: CardItem[], options: CardRenderOptions) {
    if (items.length > 1 && !options.overlayText && (options.showParentTitle || options.showParentTitleOrTitle)) {
        let hasTallSecondary = false;
        let hasShortSecondary = false;
        for (const item of items) {
            if (item.Type === 'Episode' || item.Type === 'Season' || isUsingLiveTvNaming(item.Type)) {
                hasTallSecondary = true;
            } else {
                hasShortSecondary = true;
            }
            if (hasTallSecondary && hasShortSecondary) {
                return ' card-tallSecondary';
            }
        }
    }

    return '';
}

function updateIndexValue(grouping: CardGrouping, item: CardItem, options: CardRenderOptions) {
    let newIndexValue: string | number | null | undefined = '';

    if (options.indexBy === 'PremiereDate') {
        if (item.PremiereDate) {
            try {
                newIndexValue = datetime.toLocaleDateString(datetime.parseISO8601Date(item.PremiereDate), { weekday: 'long', month: 'long', day: 'numeric' });
            } catch (error) {
                console.error('error parsing timestamp for premiere date', error);
            }
        }
    } else if (options.indexBy === 'ProductionYear') {
        newIndexValue = item.ProductionYear;
    } else if (options.indexBy === 'CommunityRating') {
        const roundedRatingDecimal = item.CommunityRating! % 1 >= 0.5 ? 0.5 : 0;
        newIndexValue = item.CommunityRating ? (Math.floor(item.CommunityRating) + roundedRatingDecimal) + '+' : null;
    }

    grouping.currentIndexValue = newIndexValue;
}

type CardGrouping = {
    isVertical: boolean;
    itemsInRow: number;
    hasOpenRow: boolean;
    hasOpenSection: boolean;
    currentIndexValue?: string | number | null;
};

function openIndexedGroup(grouping: CardGrouping, item: CardItem, options: CardRenderOptions) {
    const previousIndexValue = grouping.currentIndexValue;
    updateIndexValue(grouping, item, options);
    const newIndexValue = grouping.currentIndexValue;
    if (newIndexValue === previousIndexValue) {
        return '';
    }
    let html = '';
    if (grouping.hasOpenRow) {
        html += '</div>';
        grouping.hasOpenRow = false;
        grouping.itemsInRow = 0;
    }

    if (grouping.hasOpenSection) {
        html += '</div>';

        if (grouping.isVertical) {
            html += '</div>';
        }
        grouping.hasOpenSection = false;
    }

    if (grouping.isVertical) {
        html += '<div class="verticalSection">';
    } else {
        html += '<div class="horizontalSection">';
    }
    html += '<' + (options.sectionTitleTagName || 'div') + ' class="sectionTitle">' + newIndexValue + '</' + (options.sectionTitleTagName || 'div') + '>';
    if (grouping.isVertical) {
        html += '<div class="itemsContainer vertical-wrap">';
    }
    grouping.hasOpenSection = true;

    return html;
}

function openCardGroup(grouping: CardGrouping, item: CardItem, options: CardRenderOptions) {
    let html = '';
    if (options.indexBy) {
        html += openIndexedGroup(grouping, item, options);
    }

    if (options.rows && grouping.itemsInRow === 0) {
        if (grouping.hasOpenRow) {
            html += '</div>';
            grouping.hasOpenRow = false;
        }

        html += '<div class="cardColumn">';
        grouping.hasOpenRow = true;
    }

    return html;
}

/**
 * Generates the internal HTML markup for cards.
 * @param {Object} items - Items for which to generate the markup.
 * @param {Object} options - Options for generating the markup.
 * @returns {string} The internal HTML markup of the cards.
 */
function buildCardsHtmlInternal(items: CardItem[], options: CardRenderOptions) {
    let isVertical = false;

    if (options.shape === 'autoVertical') {
        isVertical = true;
    }

    setCardData(items, options);

    let html = '';
    const grouping: CardGrouping = { isVertical, itemsInRow: 0, hasOpenRow: false, hasOpenSection: false };
    let apiClient: ApiClient | undefined;
    let api: Api | undefined;
    let lastServerId: string | null | undefined;

    const secondaryCaptionClass = getSecondaryCaptionClass(items, options);

    for (const [i, item] of items.entries()) {
        const serverId = item.ServerId || options.serverId;

        if (serverId !== lastServerId) {
            lastServerId = serverId;
            apiClient = ServerConnections.getApiClient(lastServerId);
            api = ServerConnections.getApi(apiClient!.serverId());
        }

        html += openCardGroup(grouping, item, options);

        html += buildCard(i, item, apiClient, options, api, secondaryCaptionClass);

        grouping.itemsInRow++;

        if (options.rows && grouping.itemsInRow >= (options.rows as number)) {
            html += '</div>';
            grouping.hasOpenRow = false;
            grouping.itemsInRow = 0;
        }
    }

    if (grouping.hasOpenRow) {
        html += '</div>';
    }

    if (grouping.hasOpenSection) {
        html += '</div>';

        if (isVertical) {
            html += '</div>';
        }
    }

    return html;
}

/**
 * Builds a set of cards and inserts them into the page.
 * @param {Array} items - Array of items used to build the cards.
 * @param {options} options - Options of the cards to build.
 */
export function buildCards(items: CardItem[], options: CardRenderOptions) {
    // Abort if the container has been disposed
    const itemsContainer = options.itemsContainer as (HTMLElement & { cardBuilderHtml?: string | null }) | null | undefined;
    if (!itemsContainer || !document.body.contains(itemsContainer)) {
        return;
    }

    if (options.parentContainer) {
        if (items.length) {
            options.parentContainer.classList.remove('hide');
        } else {
            options.parentContainer.classList.add('hide');
            return;
        }
    }

    const html = buildCardsHtmlInternal(items, options);

    if (html) {
        if (itemsContainer.cardBuilderHtml !== html) {
            itemsContainer.innerHTML = html;
            itemsContainer.cardBuilderHtml = html;
            imageLoader.lazyChildren(itemsContainer);
        }
    } else {
        itemsContainer.innerHTML = html;
        itemsContainer.cardBuilderHtml = null;
    }

    if (options.autoFocus) {
        focusManager.autoFocus(itemsContainer, true);
    }
}

export default {
    getCardsHtml: getCardsHtml,
    getDefaultText: getDefaultText,
    buildCards: buildCards,
    onUserDataChanged: onUserDataChanged,
    onTimerCreated: onTimerCreated,
    onTimerCancelled: onTimerCancelled,
    onSeriesTimerCancelled: onSeriesTimerCancelled
};
