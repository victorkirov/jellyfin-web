import { renderLyricsContainer, renderMoreFromSeason, renderMoreFromArtist, renderItemCollections, renderSimilarItems, renderChannelGuide } from './relatedSections';
import { reloadUserDataButtons } from './actions';
import { type ConnectionClient } from 'lib/jellyfin-apiclient/connectionTypes';
import { renderComponent } from 'apps/legacy/renderComponent';
import { renderMarkdown } from 'utils/markdown';
import { ItemAction } from 'constants/itemAction';
import { AppFeature } from 'constants/appFeature';
import { appRouter } from 'components/router/appRouter';
import { appHost } from 'components/apphost';
import { type DetailsPage, type DetailsController, getElement, queryAll, type ItemDto } from './types';
import { type BaseItemDto, type NameGuidPair } from '@jellyfin/sdk/lib/generated-client';
import DOMPurify from 'dompurify';
import escapeHtml from 'escape-html';

import itemHelper from 'components/itemHelper';
import mediaInfo from 'components/mediainfo/mediainfo';
import layoutManager from 'lib/layoutManager';
import ItemDetailsMetadataGroup from 'components/itemDetails/ItemDetailsMetadataGroup';
import globalize from 'lib/globalize';

export function getArtistLinksHtml(artists: NameGuidPair[], serverId: string | null | undefined, context: string | null | undefined) {
    const html = [];
    const numberOfArtists = artists.length;

    for (let i = 0; i < Math.min(numberOfArtists, 10); i++) {
        const artist = artists[i];
        const href = appRouter.getRouteUrl(artist, {
            context,
            itemType: 'MusicArtist',
            serverId
        });
        html.push('<a class="button-link button-link-inherit" is="emby-linkbutton" href="' + href + '">' + escapeHtml(artist.Name) + '</a>');
    }

    let fullHtml = html.join(' / ');

    if (numberOfArtists > 10) {
        fullHtml = globalize.translate('AndOtherArtists', fullHtml, numberOfArtists - 10);
    }

    return fullHtml;
}

/**
 * Renders the item's name block
 * @param {Object} item - Item used to render the name.
 * @param {HTMLDivElement} container - Container to render the information into.
 * @param {Object} context - Application context.
 */

export function renderName(item: ItemDto, container: HTMLElement, context: string | null | undefined) {
    const { parentNameHtml, parentNameLast } = getParentNames(item, context);

    // FIXME: This whole section needs some refactoring, so it becames easier to scale across all form factors. See GH #1022
    let html = '';
    const tvShowHtml = parentNameHtml[0];
    const tvSeasonHtml = parentNameHtml[1];

    if (parentNameHtml.length) {
        if (parentNameLast) {
            // Music

            html = '<h3 class="parentName musicParentName focuscontainer-x">' + parentNameHtml.join(' - ') + '</h3>';
        } else {
            html = '<h1 class="parentName focuscontainer-x"><bdi>' + tvShowHtml + '</bdi></h1>';
        }
    }

    const name = escapeHtml(itemHelper.getDisplayName(item, {
        includeParentInfo: false
    }));

    if (html && !parentNameLast) {
        if (tvSeasonHtml) {
            html += '<h3 class="itemName infoText subtitle focuscontainer-x"><bdi>' + tvSeasonHtml + ' - ' + name + '</bdi></h3>';
        } else {
            html += '<h3 class="itemName infoText subtitle"><bdi>' + name + '</bdi></h3>';
        }
    } else if (hasOriginalTitle(item)) {
        html = '<h1 class="itemName infoText parentNameLast withOriginalTitle"><bdi>' + name + '</bdi></h1>' + html;
    } else {
        html = '<h1 class="itemName infoText parentNameLast"><bdi>' + name + '</bdi></h1>' + html;
    }

    if (hasOriginalTitle(item)) {
        html += '<h4 class="itemName infoText originalTitle">' + escapeHtml(item.OriginalTitle) + '</h4>';
    }

    container.innerHTML = html;

    if (html.length) {
        container.classList.remove('hide');
    } else {
        container.classList.add('hide');
    }
}

export function renderLinks(page: DetailsPage, item: ItemDto) {
    const externalLinksElem = getElement(page, '.itemExternalLinks');

    const links = [];

    if (!layoutManager.tv && item.HomePageUrl) {
        try {
            const parsedUrl = new URL(item.HomePageUrl);
            links.push(`<a is="emby-linkbutton" class="button-link" href="${parsedUrl.href}" target="_blank">${globalize.translate('ButtonWebsite')}</a>`);
        } catch {
            console.error('[renderLinks] Failed to parse home page URL', item.HomePageUrl);
        }
    }

    if (item.ExternalUrls) {
        for (const url of item.ExternalUrls) {
            try {
                const parsedUrl = new URL(url.Url!);
                links.push(`<a is="emby-linkbutton" class="button-link" href="${parsedUrl.href}" target="_blank">${escapeHtml(url.Name)}</a>`);
            } catch {
                console.error('[renderLinks] Failed to parse external URL', url.Url!);
            }
        }
    }

    const html = [];
    if (links.length) {
        html.push(links.join(', '));
    }

    externalLinksElem.innerHTML = html.join(', ');

    if (html.length) {
        externalLinksElem.classList.remove('hide');
    } else {
        externalLinksElem.classList.add('hide');
    }
}

export function toggleLineClamp(clampTarget: HTMLElement, e: Event) {
    const expandButton = e.target as HTMLElement;
    const clampClassName = 'detail-clamp-text';

    if (clampTarget.classList.contains(clampClassName)) {
        clampTarget.classList.remove(clampClassName);
        expandButton.innerHTML = globalize.translate('ShowLess');
    } else {
        clampTarget.classList.add(clampClassName);
        expandButton.innerHTML = globalize.translate('ShowMore');
    }
}

export function renderOverview(page: DetailsPage, item: ItemDto) {
    const overviewElements = queryAll(page, '.overview');

    if (overviewElements.length > 0) {
        const overview = DOMPurify.sanitize(renderMarkdown(item.Overview || ''));

        if (overview) {
            for (const overviewElemnt of overviewElements) {
                renderOverviewElement(overviewElemnt, overview);
            }
        } else {
            for (const overviewElemnt of overviewElements) {
                overviewElemnt.innerHTML = '';
                overviewElemnt.classList.add('hide');
            }
        }
    }
}

export function renderMiscInfo(page: DetailsPage, item: ItemDto) {
    const primaryItemMiscInfo = queryAll(page, '.itemMiscInfo-primary');

    for (const miscInfo of primaryItemMiscInfo) {
        mediaInfo.fillPrimaryMediaInfo(miscInfo, item, {
            interactive: true,
            episodeTitle: false,
            subtitles: false
        });

        if (miscInfo.innerHTML) {
            miscInfo.classList.remove('hide');
        } else {
            miscInfo.classList.add('hide');
        }
    }

    const secondaryItemMiscInfo = queryAll(page, '.itemMiscInfo-secondary');

    for (const miscInfo of secondaryItemMiscInfo) {
        mediaInfo.fillSecondaryMediaInfo(miscInfo, item, {
            interactive: true
        });

        if (miscInfo.innerHTML) {
            miscInfo.classList.remove('hide');
        } else {
            miscInfo.classList.add('hide');
        }
    }
}

export function renderTagline(page: DetailsPage, item: ItemDto) {
    const taglineElement = getElement(page, '.tagline');

    if (item.Taglines?.length) {
        taglineElement.classList.remove('hide');
        taglineElement.innerHTML = '<bdi>' + escapeHtml(item.Taglines[0]) + '</bdi>';
    } else {
        taglineElement.classList.add('hide');
    }
}

export function renderDetails(page: DetailsPage, instance: DetailsController, item: ItemDto, apiClient: ConnectionClient, context: string | null | undefined) {
    const itemDetailsGroup = getElement(page, '.itemDetailsGroup');

    if (itemDetailsGroup) {
        itemDetailsGroup.innerHTML = '';

        const renderTarget = document.createElement('div');
        // The legacy item extends the SDK DTO with nullable fields understood by the metadata UI.
        const unmountMethod = renderComponent(ItemDetailsMetadataGroup, { item: item as BaseItemDto, context: inferContext(item)! }, renderTarget);

        instance._unmount.push(unmountMethod);
        itemDetailsGroup.appendChild(renderTarget);
    }

    renderItemCollections(page, item, apiClient, context);
    renderSimilarItems(page, item, context);
    renderMoreFromSeason(page, item, apiClient);
    renderMoreFromArtist(page, item, apiClient);
    renderChannelGuide(page, apiClient, item);
    renderTagline(page, item);
    renderOverview(page, item);
    renderMiscInfo(page, item);
    reloadUserDataButtons(page, item);
    renderLyricsContainer(page, item, apiClient);

    // Don't allow redirection to other websites from the TV layout
    if (!layoutManager.tv && appHost.supports(AppFeature.ExternalLinks)) {
        renderLinks(page, item);
    }

    renderTags(page, item);
    renderSeriesAirTime(page, item);
}

export function renderSeriesAirTime(page: DetailsPage, item: ItemDto) {
    const seriesAirTime = getElement(page, '#seriesAirTime');
    if (item.Type != 'Series') {
        seriesAirTime.classList.add('hide');
        return;
    }
    let html = '';
    if (item.AirDays?.length) {
        if (item.AirDays.length == 7) {
            html += 'daily';
        } else {
            html += item.AirDays.map(function (a) {
                return a + 's';
            }).join(',');
        }
    }
    if (item.AirTime) {
        html += ' at ' + item.AirTime;
    }
    if (html) {
        html = (item.Status == 'Ended' ? 'Aired ' : 'Airs ') + html;
        seriesAirTime.innerHTML = html;
        seriesAirTime.classList.remove('hide');
    } else {
        seriesAirTime.classList.add('hide');
    }
}

export function renderTags(page: DetailsPage, item: ItemDto) {
    const itemTags = getElement(page, '.itemTags');
    const tagElements: string[] = [];
    let tags = item.Tags || [];

    if (item.Type === 'Program') {
        tags = [];
    }

    tags.forEach(tag => {
        const href = appRouter.getRouteUrl('tag', {
            tag,
            serverId: item.ServerId
        });
        tagElements.push(
            `<a href="${href}" class="button-link" is="emby-linkbutton">`
            + escapeHtml(tag)
            + '</a>'
        );
    });

    if (tagElements.length) {
        itemTags.innerHTML = globalize.translate('TagsValue', tagElements.join(', '));
        itemTags.classList.remove('hide');
    } else {
        itemTags.innerHTML = '';
        itemTags.classList.add('hide');
    }
}

export function inferContext(item: ItemDto) {
    if (item.Type === 'Movie' || item.Type === 'BoxSet') {
        return 'movies';
    }

    if (item.Type === 'Series' || item.Type === 'Season' || item.Type === 'Episode') {
        return 'tvshows';
    }

    if (item.Type === 'MusicArtist' || item.Type === 'MusicAlbum' || item.Type === 'Audio' || item.Type === 'AudioBook') {
        return 'music';
    }

    if (item.Type === 'Program') {
        return 'livetv';
    }

    return null;
}

function getParentNames(item: ItemDto, context: string | null | undefined) {
    const parentNameHtml = [];
    let parentNameLast = false;

    if (item.AlbumArtists) {
        parentNameHtml.push(getArtistLinksHtml(item.AlbumArtists, item.ServerId, context));
        parentNameLast = true;
    } else if (item.ArtistItems?.length && item.Type === 'MusicVideo') {
        parentNameHtml.push(getArtistLinksHtml(item.ArtistItems, item.ServerId, context));
        parentNameLast = true;
    } else if (item.SeriesName && item.Type === 'Episode') {
        parentNameHtml.push(`<a class="button-link button-link-inherit itemAction" is="emby-linkbutton" href="#" data-action="${ItemAction.Link}" data-id="${item.SeriesId}" data-serverid="${item.ServerId}" data-type="Series" data-isfolder="true">${escapeHtml(item.SeriesName)}</a>`);
    } else if (item.IsSeries || item.EpisodeTitle) {
        parentNameHtml.push(escapeHtml(item.Name));
    }

    appendSeasonOrAlbumName(parentNameHtml, item);

    return { parentNameHtml, parentNameLast };
}

function appendSeasonOrAlbumName(parentNameHtml: string[], item: ItemDto) {
    if (item.SeriesName && item.Type === 'Season') {
        parentNameHtml.push(`<a class="button-link button-link-inherit itemAction" is="emby-linkbutton" href="#" data-action="${ItemAction.Link}" data-id="${item.SeriesId}" data-serverid="${item.ServerId}" data-type="Series" data-isfolder="true">${escapeHtml(item.SeriesName)}</a>`);
    } else if (item.ParentIndexNumber != null && item.Type === 'Episode') {
        parentNameHtml.push(`<a class="button-link button-link-inherit itemAction" is="emby-linkbutton" href="#" data-action="${ItemAction.Link}" data-id="${item.SeasonId}" data-serverid="${item.ServerId}" data-type="Season" data-isfolder="true">${escapeHtml(item.SeasonName!)}</a>`);
    } else if (item.ParentIndexNumber != null && item.IsSeries) {
        parentNameHtml.push(escapeHtml(item.SeasonName || 'S' + item.ParentIndexNumber));
    } else if (item.Album && item.AlbumId && (item.Type === 'MusicVideo' || item.Type === 'Audio')) {
        parentNameHtml.push(`<a class="button-link button-link-inherit itemAction" is="emby-linkbutton" href="#" data-action="${ItemAction.Link}" data-id="${item.AlbumId}" data-serverid="${item.ServerId}" data-type="MusicAlbum" data-isfolder="true">${escapeHtml(item.Album)}</a>`);
    } else if (item.Album) {
        parentNameHtml.push(escapeHtml(item.Album));
    }
}

function renderOverviewElement(overviewElemnt: HTMLElement, overview: string) {
    overviewElemnt.innerHTML = '<bdi>' + overview + '</bdi>';
    overviewElemnt.classList.remove('hide');
    overviewElemnt.classList.add('detail-clamp-text');

    // Grab the sibling element to control the expand state
    const expandButton = getElement(overviewElemnt.parentElement!, '.overview-expand');

    // Detect if we have overflow of text. Based on this StackOverflow answer
    // https://stackoverflow.com/a/35157976
    if (Math.abs(overviewElemnt.scrollHeight - overviewElemnt.offsetHeight) > 2) {
        expandButton.classList.remove('hide');
    } else {
        expandButton.classList.add('hide');
    }

    expandButton.addEventListener('click', toggleLineClamp.bind(null, overviewElemnt));

    for (const anchor of queryAll(overviewElemnt, 'a')) {
        anchor.setAttribute('target', '_blank');
    }
}

function hasOriginalTitle(item: ItemDto) {
    return !!item.OriginalTitle && item.OriginalTitle != item.Name;
}
