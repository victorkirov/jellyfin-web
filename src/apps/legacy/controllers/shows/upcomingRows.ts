import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import cardBuilder from 'components/cardbuilder/cardBuilder';
import { getBackdropShape } from 'components/cardbuilder/utils/shape';
import imageLoader from 'components/images/imageLoader';
import layoutManager from 'lib/layoutManager';
import datetime from 'scripts/datetime';
import globalize from 'lib/globalize';

function enableScrollX() {
    return true;
}

function getDateText(item: BaseItemDto) {
    if (item.PremiereDate) {
        try {
            const premiereDate = datetime.parseISO8601Date(item.PremiereDate, true);
            return datetime.isRelativeDay(premiereDate, -1) ? globalize.translate('Yesterday') : datetime.toLocaleDateString(premiereDate, {
                weekday: 'long',
                month: 'short',
                day: 'numeric'
            });
        } catch (err) {
            console.error('error parsing timestamp for upcoming tv shows', err);
        }
    }
    return '';
}

export function renderUpcoming(elem: HTMLElement, items: BaseItemDto[]) {
    const groups: { name: string | undefined; items: BaseItemDto[] }[] = [];
    let currentGroupName: string | undefined;
    let currentGroup: BaseItemDto[] = [];

    for (let i = 0, length = items.length; i < length; i++) {
        const item = items[i];
        const dateText = getDateText(item);

        if (dateText != currentGroupName) {
            currentGroupName = dateText;
            currentGroup = [item];

            groups.push({
                name: currentGroupName,
                items: currentGroup
            });
        } else {
            currentGroup.push(item);
        }
    }

    let html = '';

    for (let i = 0, length = groups.length; i < length; i++) {
        const group = groups[i];
        html += '<div class="verticalSection">';
        html += '<h2 class="sectionTitle sectionTitle-cards padded-left">' + group.name + '</h2>';
        let allowBottomPadding = true;

        if (enableScrollX()) {
            allowBottomPadding = false;
            let scrollXClass = 'scrollX hiddenScrollX';

            if (layoutManager.tv) {
                scrollXClass += ' smoothScrollX';
            }

            html += '<div is="emby-itemscontainer" class="itemsContainer ' + scrollXClass + ' padded-left padded-right">';
        } else {
            html += '<div is="emby-itemscontainer" class="itemsContainer vertical-wrap padded-left padded-right">';
        }

        html += cardBuilder.getCardsHtml({
            items: group.items,
            showLocationTypeIndicator: false,
            shape: getBackdropShape(enableScrollX()),
            showTitle: true,
            preferThumb: true,
            lazy: true,
            showDetailsMenu: true,
            centerText: true,
            showParentTitle: true,
            overlayText: false,
            allowBottomPadding: allowBottomPadding,
            cardLayout: false,
            overlayMoreButton: true,
            missingIndicator: false
        });
        html += '</div>';
        html += '</div>';
    }

    elem.innerHTML = html;
    imageLoader.lazyChildren(elem);
}

