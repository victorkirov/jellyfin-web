import type { ItemDto } from 'types/base/models/item-dto';
import type { CardOptions } from 'types/cardOptions';
import type { UserItemDataDto } from '@jellyfin/sdk/lib/generated-client';
import { ItemAction } from 'constants/itemAction';
import globalize from 'lib/globalize';
import itemHelper from '../itemHelper';
import { getRightButtonsHtml } from './rowContent';

export function getUserButtons(item: ItemDto, options: CardOptions, clickEntireItem: boolean) {
    let html = '';
    if (!clickEntireItem) {
        if (options.infoButton) {
            html += `<button is="paper-icon-button-light" class="listItemButton itemAction" data-action="${ItemAction.Link}" title="${globalize.translate('ButtonInfo')}"><span class="material-icons info_outline" aria-hidden="true"></span></button>`;
        }

        if (options.rightButtons) {
            html += getRightButtonsHtml(options);
        }

        if (options.enableUserDataButtons !== false) {
            const userData: UserItemDataDto = item.UserData || {};
            const likes = userData.Likes == null ? '' : userData.Likes;

            if (itemHelper.canMarkPlayed(item) && options.enablePlayedButton !== false) {
                html += '<button is="emby-playstatebutton" type="button" class="listItemButton paper-icon-button-light" data-id="' + item.Id + '" data-serverid="' + item.ServerId + '" data-itemtype="' + item.Type + '" data-played="' + (userData.Played) + '"><span class="material-icons check" aria-hidden="true"></span></button>';
            }

            if (itemHelper.canRate(item) && options.enableRatingButton !== false) {
                html += '<button is="emby-ratingbutton" type="button" class="listItemButton paper-icon-button-light" data-id="' + item.Id + '" data-serverid="' + item.ServerId + '" data-itemtype="' + item.Type + '" data-likes="' + likes + '" data-isfavorite="' + (userData.IsFavorite) + '"><span class="material-icons favorite" aria-hidden="true"></span></button>';
            }
        }

        if (options.moreButton !== false) {
            html += `<button is="paper-icon-button-light" class="listItemButton itemAction" data-action="${ItemAction.Menu}" title="${globalize.translate('ButtonMore')}"><span class="material-icons more_vert" aria-hidden="true"></span></button>`;
        }
    }
    return html;
}
