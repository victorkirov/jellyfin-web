import type { ItemDto } from 'types/base/models/item-dto';

export type ListParams = {
    serverId: string;
    type?: string;
    parentId?: string;
    genreId?: string;
    musicGenreId?: string;
    studioId?: string;
    personId?: string;
    artistId?: string;
    tag?: string;
    IsMovie?: string;
    IsSeries?: string;
    IsNews?: string;
    IsSports?: string;
    IsKids?: string;
    IsAiring?: string;
    IsFavorite?: string;
};

export type ListQuery = Record<string, string | number | boolean | null | undefined>;
export type ListResult = { Items?: ItemDto[] | null; TotalRecordCount?: number; length?: number };
export type ListItemsContainer = HTMLElement & {
    paused?: boolean;
    fetchData: () => Promise<ListResult>;
    getItemsHtml: (items: ItemDto[]) => string;
    afterRefresh: (result: ListResult) => void;
    refreshItems: () => Promise<void>;
    pause: () => void;
    resume: (options: { refresh: boolean }) => Promise<void>;
};
