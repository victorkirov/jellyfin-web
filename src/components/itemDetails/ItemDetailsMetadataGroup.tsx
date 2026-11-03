import React, { type FC } from 'react';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { PersonKind } from '@jellyfin/sdk/lib/generated-client/models/person-kind';

import ItemDetailsMetadataList from './ItemDetailsMetadataList';

const METADATA_TYPES = [
    PersonKind.Author,
    PersonKind.Creator,
    PersonKind.Director,
    PersonKind.Writer,
    BaseItemKind.Studio,
    BaseItemKind.Genre
];

interface ItemDetailsMetadataGroupProps {
    item: BaseItemDto;
    context: string;
}

/** Renders all metadata lists of an item, so the details page needs a single React root for them. */
const ItemDetailsMetadataGroup: FC<ItemDetailsMetadataGroupProps> = ({ item, context }) => (
    <>
        {METADATA_TYPES.map(type => (
            <ItemDetailsMetadataList key={type} type={type} item={item} context={context} />
        ))}
    </>
);

export default ItemDetailsMetadataGroup;
