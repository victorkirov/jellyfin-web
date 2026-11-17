import listView from 'components/listview/listview';
import cardBuilder from 'components/cardbuilder/cardBuilder';
import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import { ItemAction } from 'constants/itemAction';
import type { ItemDto } from 'types/base/models/item-dto';
import type { CardOptions } from 'types/cardOptions';
import { CardShape } from 'components/cardbuilder/utils/shape';
import type { ListSettings } from './settings';
import type { ListParams } from './types';

type ViewSettings = ReturnType<ListSettings['getViewSettings']>;

function getImageOptions(settings: ViewSettings, params: ListParams): CardOptions {
    let shape: CardShape;
    let preferThumb;
    let preferDisc;
    let preferLogo;
    let defaultShape: CardShape | undefined;

    if (settings.imageType === 'banner') {
        shape = CardShape.Banner;
    } else if (settings.imageType === 'disc') {
        shape = CardShape.Square;
        preferDisc = true;
    } else if (settings.imageType === 'logo') {
        shape = CardShape.Backdrop;
        preferLogo = true;
    } else if (settings.imageType === 'thumb') {
        shape = CardShape.Backdrop;
        preferThumb = true;
    } else if (params.type === 'nextup') {
        shape = CardShape.Backdrop;
        preferThumb = settings.imageType === 'thumb';
    } else if (params.type === 'Programs' || params.type === 'Recordings') {
        shape = params.IsMovie === 'true' ? CardShape.Portrait : CardShape.AutoVertical;
        preferThumb = params.IsMovie !== 'true' ? 'auto' : false;
        defaultShape = params.IsMovie === 'true' ? CardShape.Portrait : CardShape.Backdrop;
    } else {
        shape = CardShape.AutoVertical;
    }

    return { shape, preferThumb, preferDisc, preferLogo, defaultShape };
}

function setProgramCaptions(posterOptions: CardOptions, params: ListParams, settings: ViewSettings) {
    let lines: number;
    const showTitle = Boolean(settings.showTitle);
    const isRecording = params.type === 'Recordings';
    lines = showTitle ? 1 : 0;
    const showParentTitle = showTitle && params.IsMovie !== 'true';

    if (showParentTitle) {
        lines++;
    }

    const showAirTime = showTitle && !isRecording;

    if (showAirTime) {
        lines++;
    }

    const showYear = showTitle && params.IsMovie === 'true' && isRecording;

    if (showYear) {
        lines++;
    }

    Object.assign(posterOptions, {
        inheritThumb: isRecording,
        context: 'livetv',
        showParentTitle: showParentTitle,
        showAirTime: showAirTime,
        showAirDateTime: showAirTime,
        overlayPlayButton: false,
        overlayMoreButton: true,
        showYear: showYear,
        coverImage: true
    });
    return lines;
}

function setCaptionOptions(posterOptions: CardOptions, params: ListParams, settings: ViewSettings) {
    const showParentTitle = Boolean(settings.showTitle);
    let lines = settings.showTitle ? 2 : 0;
    if (params.type === 'nextup') {
        posterOptions.showParentTitle = showParentTitle;
    } else if (params.type === 'Person') {
        posterOptions.showYear = false;
        posterOptions.showParentTitle = false;
        lines = 1;
    } else if (params.type === 'Audio') {
        posterOptions.showParentTitle = showParentTitle;
    } else if (params.type === 'MusicAlbum') {
        posterOptions.showParentTitle = showParentTitle;
    } else if (params.type === 'Episode') {
        posterOptions.showParentTitle = showParentTitle;
    } else if (params.type === 'MusicArtist') {
        posterOptions.showYear = false;
        lines = 1;
    } else if (params.type === 'Programs') {
        lines = setProgramCaptions(posterOptions, params, settings);
    } else {
        posterOptions.showParentTitle = showParentTitle;
    }

    return lines;
}

export function getItemsHtml(self: ListSettings, params: ListParams, items: ItemDto[]) {
    const settings = self.getViewSettings();

    if (settings.imageType === 'list') {
        return listView.getListViewHtml({
            items: items
        });
    }

    const posterOptions: CardOptions & { items: ItemDto[] } = {
        ...getImageOptions(settings, params),
        items,
        showTitle: settings.showTitle ?? undefined,
        showYear: settings.showTitle ?? undefined,
        centerText: true,
        coverImage: true,
        overlayPlayButton: false,
        overlayMoreButton: true,
        overlayText: !settings.showTitle,
        action: params.type === 'Audio' ? ItemAction.PlayAllFromHere : null
    };

    const lines = setCaptionOptions(posterOptions, params, settings);
    posterOptions.lines = lines;
    posterOptions.items = items;

    const item = self.currentItem;
    if (item && item.CollectionType === CollectionType.Folders) {
        posterOptions.context = 'folders';
    }

    return cardBuilder.getCardsHtml(posterOptions);
}

