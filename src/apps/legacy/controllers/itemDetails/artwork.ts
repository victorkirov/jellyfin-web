import { type ConnectionClient } from 'lib/jellyfin-apiclient/connectionTypes';
import { type ItemDto } from 'types/base/models/item-dto';
import { buildCardImage } from 'components/cardbuilder/cardImage';
import { clearBackdrop, setBackdrops } from 'components/backdrop/backdrop';
import { type DetailsPage, getElement, queryAll } from './types';
import { type BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

import imageLoader from 'components/images/imageLoader';
import layoutManager from 'lib/layoutManager';
import dom from 'utils/dom';
import * as userSettings from 'scripts/settings/userSettings';

export function renderBackdrop(page: DetailsPage, item: ItemDto) {
    if (dom.getWindowSize().innerWidth >= 1000) {
        const isBannerEnabled = !layoutManager.tv && userSettings.detailsBanner();
        // If backdrops are disabled, but the header banner is enabled, add a class to the page to disable the transparency
        page.classList.toggle('noBackdropTransparency', isBannerEnabled && !userSettings.enableBackdrops());

        setBackdrops([item], undefined, isBannerEnabled);
    } else {
        clearBackdrop();
    }
}

export function logoImageUrl(item: ItemDto, apiClient: ConnectionClient, options: { type?: string; tag?: string } = {}) {
    options = options || {};
    options.type = 'Logo';

    if (item.ImageTags?.Logo) {
        options.tag = item.ImageTags.Logo;
        return apiClient.getScaledImageUrl(item.Id!, options);
    }

    if (item.ParentLogoImageTag) {
        options.tag = item.ParentLogoImageTag;
        return apiClient.getScaledImageUrl(item.ParentLogoItemId!, options);
    }

    return null;
}

export function renderLogo(page: DetailsPage, item: ItemDto, apiClient: ConnectionClient) {
    const detailLogo = getElement(page, '.detailLogo');

    const url = logoImageUrl(item, apiClient, {});

    if (url) {
        detailLogo.classList.remove('hide');
        imageLoader.setLazyImage(detailLogo, url);
    } else {
        detailLogo.classList.add('hide');
    }
}

export function renderDetailImage(apiClient: ConnectionClient, elem: HTMLElement, item: ItemDto, loader: typeof imageLoader) {
    // The legacy item adds nullable fields to the SDK DTO; the renderer accepts the same shape.
    const html = buildCardImage(
        apiClient,
        item as BaseItemDto,
        { width: dom.getWindowSize().innerWidth * 0.25 }
    );

    elem.innerHTML = html;
    loader.lazyChildren(elem);
}

export function renderImage(page: DetailsPage, item: ItemDto, apiClient: ConnectionClient) {
    queryAll(page, '.detailImageContainer')
        .forEach(elem => {
            renderDetailImage(
                apiClient,
                elem,
                item,
                imageLoader
            );
        });
}
