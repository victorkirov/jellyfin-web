import type { BaseItemDtoQueryResult } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto-query-result';
import { getPreviewFavoriteSections, getFavoriteCardOptions, type FavoriteSection } from './favoriteSectionCatalog';
import dom from 'utils/dom';
import globalize from 'lib/globalize';
import { getParameterByName } from 'utils/url';

import cardBuilder from './cardbuilder/cardBuilder';
import imageLoader from './images/imageLoader';
import layoutManager from '../lib/layoutManager';
import loading from './loading/loading';

import 'components/itemscontainer/emby-itemscontainer';

import 'styles/scrollstyles.scss';

function enableScrollX() {
    return true;
}

function loadSection(elem: HTMLElement, userId: string, topParentId: string | undefined, section: FavoriteSection, isSingleSection: boolean) {
    const screenWidth = dom.getWindowSize().innerWidth;
    const options: Record<string, string | number | boolean> = {
        SortBy: 'SortName',
        SortOrder: 'Ascending',
        Filters: 'IsFavorite',
        Recursive: true,
        Fields: 'PrimaryImageAspectRatio',
        CollapseBoxSetItems: false,
        ExcludeLocationTypes: 'Virtual',
        EnableTotalRecordCount: false
    };

    if (topParentId) {
        options.ParentId = topParentId;
    }

    if (!isSingleSection) {
        options.Limit = 6;

        if (enableScrollX()) {
            options.Limit = 20;
        } else if (screenWidth >= 1920) {
            options.Limit = 10;
        } else if (screenWidth >= 1440) {
            options.Limit = 8;
        }
    }

    let promise: Promise<BaseItemDtoQueryResult>;

    if (section.types === 'MusicArtist') {
        promise = window.ApiClient.getArtists(userId, options);
    } else {
        options.IncludeItemTypes = section.types;
        promise = window.ApiClient.getItems(userId, options);
    }

    return promise.then(function (result) {
        let html = '';

        if (result.Items!.length) {
            html += '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left">';

            if (!layoutManager.tv && options.Limit && result.Items!.length >= Number(options.Limit)) {
                html += '<a is="emby-linkbutton" href="' + ('#/list?serverId=' + window.ApiClient.serverId() + '&type=' + section.types + '&IsFavorite=true') + '" class="more button-flat button-flat-mini sectionTitleTextButton">';
                html += '<h2 class="sectionTitle sectionTitle-cards">';
                html += globalize.translate(section.name);
                html += '</h2>';
                html += '<span class="material-icons chevron_right" aria-hidden="true"></span>';
                html += '</a>';
            } else {
                html += '<h2 class="sectionTitle sectionTitle-cards">' + globalize.translate(section.name) + '</h2>';
            }

            html += '</div>';
            if (enableScrollX()) {
                let scrollXClass = 'scrollX hiddenScrollX';
                if (layoutManager.tv) {
                    scrollXClass += ' smoothScrollX';
                }

                html += '<div is="emby-itemscontainer" class="itemsContainer ' + scrollXClass + ' padded-left padded-right">';
            } else {
                html += '<div is="emby-itemscontainer" class="itemsContainer vertical-wrap padded-left padded-right">';
            }

            html += cardBuilder.getCardsHtml(result.Items!, getFavoriteCardOptions(section));
            html += '</div>';
        }

        elem.innerHTML = html;
        imageLoader.lazyChildren(elem);
    });
}

export function loadSections(page: HTMLElement, userId: string, topParentId?: string, types?: string[]) {
    loading.show();
    let sections = getPreviewFavoriteSections();
    const sectionid = getParameterByName('sectionid');

    if (sectionid) {
        sections = sections.filter(function (s) {
            return s.id === sectionid;
        });
    }

    if (types) {
        sections = sections.filter(function (s) {
            return types.indexOf(s.id!) !== -1;
        });
    }

    let elem = page.querySelector<HTMLElement>('.favoriteSections')!;

    if (!elem.innerHTML) {
        let html = '';

        for (let i = 0, length = sections.length; i < length; i++) {
            html += '<div class="verticalSection section' + sections[i].id + '"></div>';
        }

        elem.innerHTML = html;
    }

    const promises = [];

    for (let i = 0, length = sections.length; i < length; i++) {
        const section = sections[i];
        elem = page.querySelector<HTMLElement>('.section' + section.id)!;
        promises.push(loadSection(elem, userId, topParentId, section, sections.length === 1));
    }

    void Promise.all(promises).then(function () {
        loading.hide();
    });
}

export default {
    render: loadSections
};
