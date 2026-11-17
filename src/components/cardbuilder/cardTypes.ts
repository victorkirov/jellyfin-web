import type { Api } from '@jellyfin/sdk';
import type { ApiClient } from 'jellyfin-apiclient';
import type { ItemDto } from 'types/base/models/item-dto';
import type { CardOptions } from 'types/cardOptions';

export type CardItem = Omit<ItemDto, 'Type' | 'MediaType' | 'AlbumArtists' | 'Role'> & {
    Type?: string;
    MediaType?: string | null;
    Series?: string | null;
    Role?: string | null;
    RoleList?: { Type: string; Role?: string | null }[];
    AlbumArtists?: CardItem[] | null;
};

export type CardRenderOptions = Omit<CardOptions, 'shape' | 'defaultShape' | 'rows' | 'action' | 'items'> & {
    shape?: string | null;
    defaultShape?: string;
    rows?: number | Record<string, number> | null;
    action?: string | null;
    items?: CardItem[] | null;
    transition?: boolean;
    leadingButtons?: { name: string; id: string; icon: string; routeUrl: string }[] | null;
    sectionTitleTagName?: string;
    autoFocus?: boolean;
};

export type CardRenderContext = {
    item: CardItem;
    apiClient: ApiClient;
    options: CardRenderOptions;
    api?: Api;
};

export type FooterFlags = { forceName: boolean; overlayText?: boolean; isOuterFooter: boolean };
export type FooterUrls = { imgUrl?: string; logoUrl?: string | null };
