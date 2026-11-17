import type { ItemDto } from 'types/base/models/item-dto';
import type { CardOptions } from 'types/cardOptions';
import itemHelper from '../itemHelper';
import datetime from '../../scripts/datetime';

function getParentTitle(item: ItemDto, options: CardOptions) {
    let parentTitle: string | null | undefined = null;

    if (options.showParentTitle) {
        if (item.Type === 'Episode') {
            parentTitle = item.SeriesName;
        } else if (item.IsSeries || (item.EpisodeTitle && item.Name)) {
            parentTitle = item.Name;
        }
    }

    return parentTitle;
}

function addArtistLine(textlines: (string | null | undefined)[], item: ItemDto, options: CardOptions) {
    if (item.IsFolder) {
        if (options.artist !== false && item.AlbumArtist && item.Type === 'MusicAlbum') {
            textlines.push(item.AlbumArtist);
        }
    } else if (options.artist) {
        const artistItems = item.ArtistItems;
        if (artistItems && item.Type !== 'MusicAlbum') {
            textlines.push(artistItems.map(artist => {
                return artist.Name;
            }).join(', '));
        }
    }
}

function addTitleLines(textlines: (string | null | undefined)[], options: CardOptions, parentTitle: string | null | undefined, displayName: string | null | undefined) {
    if (options.showParentTitle && options.parentTitleWithTitle) {
        if (displayName) {
            if (parentTitle) {
                parentTitle += ' - ';
            }
            parentTitle = (parentTitle || '') + displayName;
        }

        textlines.push(parentTitle || '');
    } else if (options.showParentTitle) {
        textlines.push(parentTitle || '');
    }

    if (displayName && !options.parentTitleWithTitle) {
        textlines.push(displayName);
    }
}

export function getCaptionLines(item: ItemDto, options: CardOptions) {
    const textlines = [];

    if (options.showProgramDateTime) {
        textlines.push(datetime.toLocaleString(datetime.parseISO8601Date(item.StartDate!), {

            weekday: 'long',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        }));
    }

    if (options.showProgramTime) {
        textlines.push(datetime.getDisplayTime(datetime.parseISO8601Date(item.StartDate!)));
    }

    if (options.showChannel && item.ChannelName) {
        textlines.push(item.ChannelName);
    }

    const parentTitle = getParentTitle(item, options);

    let displayName = itemHelper.getDisplayName(item, {
        includeParentInfo: options.includeParentInfoInTitle
    });

    if (options.showIndexNumber && item.IndexNumber != null) {
        displayName = `${item.IndexNumber}. ${displayName}`;
    }

    addTitleLines(textlines, options, parentTitle, displayName);

    addArtistLine(textlines, item, options);

    if (item.Type === 'TvChannel' && item.CurrentProgram) {
        textlines.push(itemHelper.getDisplayName(item.CurrentProgram));
    }
    return textlines;
}
