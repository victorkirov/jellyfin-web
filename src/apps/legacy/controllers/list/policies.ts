import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import type { ItemDto } from 'types/base/models/item-dto';
import type { ListParams } from './types';

export function parseOptionalBoolean(value: string | undefined): boolean | undefined {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
}

export function canPlayList(item: ItemDto | null, params: ListParams): boolean {
    const itemType = item?.Type;
    if (itemType !== 'MusicGenre' && (params.type === 'Programs' || itemType === 'Channel')) return false;
    if (itemType === 'UserView') return false;
    if (itemType === 'CollectionFolder') {
        return item?.CollectionType === CollectionType.Homevideos || item?.CollectionType === CollectionType.Musicvideos;
    }
    return true;
}
