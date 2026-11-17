import type { ApiClient } from 'jellyfin-apiclient';
import type { ItemDto } from 'types/base/models/item-dto';
import type { CardItem, CardRenderOptions, FooterFlags, FooterUrls } from './cardTypes';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { PersonKind } from '@jellyfin/sdk/lib/generated-client/models/person-kind';
import escapeHtml from 'escape-html';
import { ItemAction } from 'constants/itemAction';
import datetime from 'scripts/datetime';
import globalize from 'lib/globalize';
import itemHelper from '../itemHelper';
import layoutManager from '../../lib/layoutManager';
import { appRouter } from '../router/appRouter';
import itemShortcuts from '../shortcuts';
import { isUsingLiveTvNaming } from './utils/builder';

/**
 * Generates the HTML markup for a card's text.
 * @param {Array} lines - Array containing the text lines.
 * @param {string} cssClass - Base CSS class to use for the lines.
 * @param {boolean} forceLines - Flag to force the rendering of all lines.
 * @param {boolean} isOuterFooter - Flag to mark the text lines as outer footer.
 * @param {number} maxLines - Maximum number of lines to render.
 * @returns {string} HTML markup for the card's text.
 */
function getCardTextLines(lines: (string | undefined)[], cssClass: string, forceLines: boolean, isOuterFooter: boolean, maxLines?: number) {
    let html = '';

    let valid = 0;

    for (const text of lines) {
        let currentCssClass = cssClass;

        if (valid > 0 && isOuterFooter) {
            currentCssClass += ' cardText-secondary';
        } else if (valid === 0 && isOuterFooter) {
            currentCssClass += ' cardText-first';
        }

        if (text) {
            html += "<div class='" + currentCssClass + "'>";
            html += '<bdi>' + text + '</bdi>';
            html += '</div>';
            valid++;

            if (maxLines && valid >= maxLines) {
                break;
            }
        }
    }

    if (forceLines) {
        const linesLength = maxLines || Math.min(lines.length, maxLines || lines.length);

        while (valid < linesLength) {
            html += "<div class='" + cssClass + "'>&nbsp;</div>";
            valid++;
        }
    }

    return html;
}

/**
 * Returns the air time text for the item based on the given times.
 * @param {object} item - Item used to generate the air time text.
 * @param {boolean} showAirDateTime - ISO8601 date for the start of the show.
 * @param {boolean} showAirEndTime - ISO8601 date for the end of the show.
 * @returns {string} The air time text for the item based on the given dates.
 */
function getAirTimeText(item: CardItem, showAirDateTime?: boolean, showAirEndTime?: boolean) {
    let airTimeText = '';

    if (item.StartDate) {
        try {
            let date = datetime.parseISO8601Date(item.StartDate);

            if (showAirDateTime) {
                airTimeText += datetime.toLocaleDateString(date, { weekday: 'short', month: 'short', day: 'numeric' }) + ' ';
            }

            airTimeText += datetime.getDisplayTime(date);

            if (item.EndDate && showAirEndTime) {
                date = datetime.parseISO8601Date(item.EndDate);
                airTimeText += ' - ' + datetime.getDisplayTime(date);
            }
        } catch (e) {
            console.error('error parsing date: ' + item.StartDate, e);
        }
    }

    return airTimeText;
}

/**
 * Returns the display label for a person's role, combining their Type and Role.
 * @param {object} personRole - The person's role used to generate the label.
 * @param {string} personRole.Type - The PersonKind of the role (i.e. Director, Writer, Actor).
 * @param {string} [personRole.Role] - The specific role or job title, if any.
 * @returns {string} The display label for the role.
 */
function getPeopleRoleOrTypeLabel({ Type, Role }: { Type?: string; Role?: string | null }) {
    if ((Type === PersonKind.Actor || Type === PersonKind.GuestStar) && Role) {
        const roleText = globalize.translate('PersonRole', escapeHtml(Role));
        return `<span title="${roleText}">${roleText}</span>`;
    }
    if (!Role || Role.toLowerCase() === Type!.toLowerCase()) {
        return escapeHtml(globalize.translate(Type));
    }
    return escapeHtml(globalize.translate(Role));
}

/**
 * Generates the HTML markup for the card's footer text.
 * @param {Object} item - Item used to generate the footer text.
 * @param {Object} apiClient - API client instance.
 * @param {Object} options - Options used to generate the footer text.
 * @param {string} footerClass - CSS classes of the footer element.
 * @param {string} progressHtml - HTML markup of the progress bar element.
 * @param {Object} flags - Various flags for the footer
 * @param {Object} urls - Various urls for the footer
 * @returns {string} HTML markup of the card's footer text element.
 */
export type CardFooterContext = FooterFlags & FooterUrls & {
    item: CardItem;
    options: CardRenderOptions;
    footerClass: string;
    progressHtml: string;
};

export function getCardFooterText(item: CardItem, apiClient: ApiClient | undefined, options: CardRenderOptions, footerClass: string, progressHtml: string, flags: FooterFlags, urls: FooterUrls) {
    return renderCardFooter({ item, options, footerClass, progressHtml, forceName: flags.forceName, overlayText: flags.overlayText, isOuterFooter: flags.isOuterFooter, imgUrl: urls.imgUrl, logoUrl: urls.logoUrl });
}

function renderCardFooter(context: CardFooterContext) {
    const { options, footerClass, progressHtml } = context;
    const flags = context;
    const urls = context;
    let html = '';

    if (urls.logoUrl) {
        html += '<div class="lazy cardFooterLogo" data-src="' + urls.logoUrl + '"></div>';
    }

    const lines = getCardCaptionLines(context);
    const cssClass = options.centerText ? 'cardText cardTextCentered' : 'cardText';

    html += getCardTextLines(lines, cssClass, !options.overlayText, flags.isOuterFooter, options.lines);

    if (progressHtml) {
        html += progressHtml;
    }

    if (html && (!flags.isOuterFooter || urls.logoUrl || options.cardLayout)) {
        html = '<div class="' + footerClass + '">' + html;

        html += '</div>';
    }

    return html;
}

type CaptionContext = {
    item: CardItem;
    options: CardRenderOptions;
    flags: FooterFlags;
    serverId?: string | null;
    parentTitleUnderneath: boolean;
};

function getCardCaptionLines(context: CardFooterContext) {
    const item = context.item.ProgramInfo || context.item;
    const { options } = context;
    const flags = context;
    const urls = context;
    const showTitle = options.showTitle === 'auto' ? true : (options.showTitle || item.Type === 'PhotoAlbum' || item.Type === 'Folder');
    const showOtherText = flags.isOuterFooter ? !flags.overlayText : flags.overlayText;

    const serverId = item.ServerId || options.serverId;

    let lines: (string | undefined)[] = [];
    const parentTitleUnderneath = item.Type === 'MusicAlbum' || item.Type === 'Audio' || item.Type === 'MusicVideo';
    const captionContext = { item, options, flags, serverId, parentTitleUnderneath };
    const titleAdded = appendParentCaption(captionContext, lines, showTitle, showOtherText);

    let showMediaTitle = (showTitle && !titleAdded) || (options.showParentTitleOrTitle && !lines.length);
    if (!showMediaTitle && !titleAdded && (showTitle || flags.forceName)) {
        showMediaTitle = true;
    }

    if (showMediaTitle) {
        const name = options.showTitle === 'auto' && !item.IsFolder && item.MediaType === 'Photo' ? '' : itemHelper.getDisplayName(item, {
            includeParentInfo: options.includeParentInfoInTitle
        });

        lines.push(getTextActionButton({
            Id: item.Id,
            ServerId: serverId,
            Name: name,
            Type: item.Type,
            CollectionType: item.CollectionType,
            IsFolder: item.IsFolder
        }));
    }

    if (showOtherText) {
        appendOtherCaptionLines(captionContext, lines);
    }

    if ((showTitle || !urls.imgUrl) && flags.forceName && flags.overlayText && lines.length === 1) {
        lines = [];
    }

    if (flags.overlayText && showTitle) {
        lines = [escapeHtml(item.Name)];
    }

    return lines;
}

function getSeriesCaption(item: CardItem, serverId?: string | null) {
    if (item.SeriesId) {
        return getTextActionButton({ Id: item.SeriesId, ServerId: serverId, Name: item.SeriesName, Type: 'Series', IsFolder: true });
    }
    return escapeHtml(item.SeriesName);
}

function appendParentCaption(context: CaptionContext, lines: (string | undefined)[], showTitle: boolean | string | undefined, showOtherText: boolean | undefined) {
    const { item, options, flags, serverId, parentTitleUnderneath } = context;
    if (!(showOtherText && (options.showParentTitle || options.showParentTitleOrTitle) && !parentTitleUnderneath)) {
        return false;
    }
    if (flags.isOuterFooter && (item.Type === 'Episode' || item.Type === 'Season') && item.SeriesName) {
        lines.push(getSeriesCaption(item, serverId));
    } else if (isUsingLiveTvNaming(item.Type)) {
        lines.push(escapeHtml(item.Name));

        if (!item.EpisodeTitle && !item.IndexNumber) {
            return true;
        }
    } else {
        const parentTitle = item.SeriesName || item.Series || item.Album || item.AlbumArtist || '';

        if (parentTitle || showTitle) {
            lines.push(escapeHtml(parentTitle));
        }
    }

    return false;
}

function appendOtherCaptionLines(context: CaptionContext, lines: (string | undefined)[]) {
    const { item, options, flags, serverId, parentTitleUnderneath } = context;

    if (options.showParentTitle && parentTitleUnderneath) {
        if (flags.isOuterFooter && item.AlbumArtists?.length) {
            const artistText = item.AlbumArtists
                .map(artist => {
                    artist.ServerId = serverId;
                    artist.Type = BaseItemKind.MusicArtist;
                    artist.IsFolder = true;
                    return getTextActionButton(artist);
                })
                .join(' / ');
            lines.push(artistText);
        } else {
            lines.push(escapeHtml(isUsingLiveTvNaming(item.Type) ? item.Name : (item.SeriesName || item.Series || item.Album || item.AlbumArtist || '')));
        }
    }

    if (item.ExtraType && item.ExtraType !== 'Unknown') {
        lines.push(globalize.translate(item.ExtraType));
    }

    if (options.showItemCounts) {
        lines.push(getItemCountsHtml(options, item));
    }

    if (options.textLines) {
        const additionalLines = options.textLines(item as ItemDto);
        for (const additionalLine of additionalLines) {
            lines.push(additionalLine);
        }
    }
    appendDateCaptionLines(context, lines);
    appendProgramCaptionLines(context, lines);
}

function appendYearCaption(context: CaptionContext, lines: (string | undefined)[]) {
    const { item, options } = context;
    if (options.showYear || options.showSeriesYear) {
        const productionYear = item.ProductionYear && datetime.toLocaleString(item.ProductionYear, { useGrouping: false });
        if (item.Type === 'Series') {
            if (item.Status === 'Continuing') {
                lines.push(globalize.translate('SeriesYearToPresent', productionYear || ''));
            } else if (item.EndDate && item.ProductionYear) {
                const endYear = datetime.toLocaleString(datetime.parseISO8601Date(item.EndDate).getFullYear(), { useGrouping: false });
                lines.push(productionYear + ((endYear === productionYear) ? '' : (' - ' + endYear)));
            } else {
                lines.push(productionYear || '');
            }
        } else {
            lines.push(productionYear || '');
        }
    }
}

function appendPremiereDate(item: CardItem, options: CardRenderOptions, lines: (string | undefined)[]) {
    if (options.showPremiereDate) {
        if (item.PremiereDate) {
            try {
                lines.push(datetime.toLocaleDateString(
                    datetime.parseISO8601Date(item.PremiereDate),
                    { weekday: 'long', month: 'long', day: 'numeric' }
                ));
            } catch {
                lines.push('');
            }
        } else {
            lines.push('');
        }
    }
}

function appendDateCaptionLines(context: CaptionContext, lines: (string | undefined)[]) {
    const { item, options } = context;
    if (options.showSongCount) {
        let songLine = '';

        if (item.SongCount) {
            songLine = item.SongCount === 1 ?
                globalize.translate('ValueOneSong') :
                globalize.translate('ValueSongCount', item.SongCount);
        }

        lines.push(songLine);
    }

    appendPremiereDate(item, options, lines);

    appendYearCaption(context, lines);

    if (options.showRuntime) {
        if (item.RunTimeTicks) {
            lines.push(datetime.getDisplayRunningTime(item.RunTimeTicks));
        } else {
            lines.push('');
        }
    }
}

function appendPersonRole(item: CardItem, options: CardRenderOptions, lines: (string | undefined)[]) {
    if (options.showPersonRoleOrType && item.Type) {
        if ((item.RoleList?.length || 0) > 1) {
            lines.push(item.RoleList!.map(getPeopleRoleOrTypeLabel).join(' / '));
        } else {
            lines.push(getPeopleRoleOrTypeLabel(item));
        }
    }
}

function appendProgramCaptionLines(context: CaptionContext, lines: (string | undefined)[]) {
    const { item, options, serverId } = context;
    if (options.showAirTime) {
        lines.push(getAirTimeText(item, options.showAirDateTime, options.showAirEndTime) || '');
    }

    if (options.showChannelName) {
        if (item.ChannelId) {
            lines.push(getTextActionButton({

                Id: item.ChannelId,
                ServerId: serverId,
                Name: item.ChannelName,
                Type: 'TvChannel',
                MediaType: item.MediaType,
                IsFolder: false

            }, item.ChannelName));
        } else {
            lines.push(escapeHtml(item.ChannelName || '') || '&nbsp;');
        }
    }

    if (options.showCurrentProgram && item.Type === 'TvChannel') {
        if (item.CurrentProgram) {
            lines.push(escapeHtml(item.CurrentProgram.Name));
        } else {
            lines.push('');
        }
    }

    if (options.showCurrentProgramTime && item.Type === 'TvChannel') {
        if (item.CurrentProgram) {
            lines.push(getAirTimeText(item.CurrentProgram, false, true) || '');
        } else {
            lines.push('');
        }
    }

    appendPersonRole(item, options, lines);
}

/**
 * Generates the HTML markup for the action button.
 * @param {Object} item - Item used to generate the action button.
 * @param {string} text - Text of the action button.
 * @param {string} serverId - ID of the server.
 * @returns {string} HTML markup of the action button.
 */
function getTextActionButton(item: CardItem, text?: string | null, serverId?: string) {
    if (!text) {
        text = itemHelper.getDisplayName(item);
    }

    text = escapeHtml(text);

    if (layoutManager.tv) {
        return text;
    }

    const url = appRouter.getRouteUrl(item);
    let html = '<a href="' + url + '" ' + itemShortcuts.getShortcutAttributesHtml(item, serverId) + ' class="itemAction textActionButton" title="' + text + `" data-action="${ItemAction.Link}">`;
    html += text;
    html += '</a>';

    return html;
}

/**
 * Generates HTML markup for the item count indicator.
 * @param {Object} options - Options used to generate the item count.
 * @param {Object} item - Item used to generate the item count.
 * @returns {string} HTML markup for the item count indicator.
 */
function appendItemCount(counts: string[], count: number | null | undefined, singular: string, plural: string) {
    if (count) {
        counts.push(count === 1 ? globalize.translate(singular) : globalize.translate(plural, count));
    }
}

function getItemCountsHtml(options: CardRenderOptions, item: CardItem) {
    const counts: string[] = [];
    if (item.Type === 'Playlist') {
        let minutes = item.RunTimeTicks ? item.RunTimeTicks / 600000000 : 0;
        if (item.RunTimeTicks) {
            minutes = minutes || 1;
        }
        counts.push(globalize.translate('ValueMinutes', Math.round(minutes)));
    } else if (item.Type === 'Genre' || item.Type === 'Studio') {
        appendItemCount(counts, item.MovieCount, 'ValueOneMovie', 'ValueMovieCount');
        appendItemCount(counts, item.SeriesCount, 'ValueOneSeries', 'ValueSeriesCount');
        appendItemCount(counts, item.EpisodeCount, 'ValueOneEpisode', 'ValueEpisodeCount');
    } else if (item.Type === 'MusicGenre' || options.context === 'MusicArtist') {
        appendItemCount(counts, item.AlbumCount, 'ValueOneAlbum', 'ValueAlbumCount');
        appendItemCount(counts, item.SongCount, 'ValueOneSong', 'ValueSongCount');
        appendItemCount(counts, item.MusicVideoCount, 'ValueOneMusicVideo', 'ValueMusicVideoCount');
    } else if (item.Type === 'Series') {
        counts.push(item.RecursiveItemCount === 1 ? globalize.translate('ValueOneEpisode') : globalize.translate('ValueEpisodeCount', item.RecursiveItemCount));
    }
    return counts.join(', ');
}
