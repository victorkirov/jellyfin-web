import escapeHtml from 'escape-html';

import { getDefaultBackgroundClass } from 'components/cardbuilder/utils/builder';
import globalize from 'lib/globalize';
import layoutManager from 'lib/layoutManager';
import type { ServerInfo } from 'lib/jellyfin-apiclient/connectionTypes';
import browser from 'scripts/browser';

const enableFocusTransform = !browser.slow && !browser.edge;

export function getServerCardsHtml(servers: ServerInfo[]) {
    const items = servers.map(function (server) {
        return {
            name: server.Name,
            icon: 'storage',
            cardType: '',
            id: server.Id,
            server: server
        };
    });
    let html = items.map(function (item) {
        // TODO move card creation code to Card component
        const cardImageContainer = '<span class="cardImageIcon material-icons ' + item.icon + '" aria-hidden="true"></span>';
        let cssClass = 'card overflowSquareCard loginSquareCard scalableCard overflowSquareCard-scalable';

        if (layoutManager.tv) {
            cssClass += ' show-focus';

            if (enableFocusTransform) {
                cssClass += ' show-animation';
            }
        }

        const cardBoxCssClass = 'cardBox';

        const innerOpening = '<div class="' + cardBoxCssClass + '">';
        let cardContainer = '';
        cardContainer += '<button raised class="' + cssClass + '" style="display:inline-block;" data-id="' + item.id + '" data-url="' + '' + '" data-cardtype="' + item.cardType + '">';
        cardContainer += innerOpening;
        cardContainer += '<div class="cardScalable">';
        cardContainer += '<div class="cardPadder cardPadder-square">';
        cardContainer += '</div>';
        cardContainer += '<div class="cardContent">';
        cardContainer += `<div class="cardImageContainer coveredImage ${getDefaultBackgroundClass()}">`;
        cardContainer += cardImageContainer;
        cardContainer += '</div>';
        cardContainer += '</div>';
        cardContainer += '</div>';
        cardContainer += '<div class="cardFooter">';
        cardContainer += '<div class="cardText cardTextCentered">' + escapeHtml(String(item.name)) + '</div>';
        cardContainer += '</div></div></button>';
        return cardContainer;
    }).join('');

    if (!items.length) {
        html = '<p>' + globalize.translate('MessageNoServersAvailable') + '</p>';
    }

    return html;
}
