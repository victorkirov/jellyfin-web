import { useMemo } from 'react';
import { userQueryKey } from 'utils/query/queryKeys';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import { useQuery } from '@tanstack/react-query';
import { CardShape } from 'components/cardbuilder/utils/shape';
import { useApi } from '../../../../../hooks/useApi';
import { addSection, getCardOptionsFromType, getItemTypesFromCollectionType, getTitleFromType, isLivetv, isMovies, isMusic, isTVShows, sortSections } from '../utils/search';
import { useArtistsSearch } from './useArtistsSearch';
import { usePeopleSearch } from './usePeopleSearch';
import { useStudiosSearch } from './useStudiosSearch';
import { useVideoSearch } from './useVideoSearch';
import { Section } from '../types';
import { useLiveTvSearch } from './useLiveTvSearch';
import { fetchItemsByType } from './fetchItemsByType';
import { useProgramsSearch } from './useProgramsSearch';
import { LIVETV_CARD_OPTIONS } from '../constants/liveTvCardOptions';

const COVER_CARD_OPTIONS = { coverImage: true };
const STUDIO_CARD_OPTIONS = { shape: CardShape.SquareOverflow };
const VIDEO_CARD_OPTIONS = { showParentTitle: true };

export const useSearchItems = (
    parentId?: string,
    collectionType?: CollectionType,
    searchTerm?: string
) => {
    const artists = useArtistsSearch(parentId, collectionType, searchTerm);
    const people = usePeopleSearch(parentId, collectionType, searchTerm);
    const studios = useStudiosSearch(parentId, collectionType, searchTerm);
    const videos = useVideoSearch(parentId, collectionType, searchTerm);
    const programs = useProgramsSearch(parentId, collectionType, searchTerm);
    const liveTv = useLiveTvSearch(parentId, collectionType, searchTerm);
    const { api, user } = useApi();
    const userId = user?.Id;

    const isLiveTv = !!collectionType && isLivetv(collectionType);
    const items = useQuery({
        queryKey: userQueryKey(api, userId, 'Search', 'PrimaryItems', collectionType, parentId, searchTerm),
        queryFn: async ({ signal }) => {
            const sections: Section[] = [];
            const itemTypes: BaseItemKind[] = getItemTypesFromCollectionType(collectionType);

            const searchData = await fetchItemsByType(
                api!,
                userId,
                {
                    includeItemTypes: itemTypes,
                    parentId,
                    searchTerm,
                    isMissing: itemTypes.includes(BaseItemKind.Episode) && !user?.Configuration?.DisplayMissingEpisodes ? false : undefined,
                    limit: 800
                },
                { signal }
            );

            if (searchData.Items) {
                for (const itemType of itemTypes) {
                    const matchingItems: BaseItemDto[] = [];
                    for (const searchItem of searchData.Items) {
                        if (searchItem.Type === itemType) {
                            matchingItems.push(searchItem);
                        }
                    }
                    addSection(sections, getTitleFromType(itemType), matchingItems, getCardOptionsFromType(itemType));
                }
            }

            return sortSections(sections);
        },
        enabled: !!api && !!userId && !isLiveTv
    });

    // Derive rows from their source queries instead of caching an aggregate that
    // can outlive a failed or retried subsidiary request.
    const data = useMemo(() => {
        if (isLiveTv) return sortSections([...(liveTv.data?.sections || [])]);
        const sections: Section[] = [...(items.data || [])];
        if (!collectionType || isMusic(collectionType)) {
            addSection(sections, 'Artists', artists.data?.Items, COVER_CARD_OPTIONS);
        }
        if (!collectionType || isMovies(collectionType) || isTVShows(collectionType)) {
            addSection(sections, 'People', people.data?.Items, COVER_CARD_OPTIONS);
            addSection(sections, 'Studios', studios.data?.Items, STUDIO_CARD_OPTIONS);
        }
        if (!collectionType) {
            addSection(sections, 'Programs', programs.data?.Items, LIVETV_CARD_OPTIONS);
            addSection(sections, 'HeaderVideos', videos.data?.Items, VIDEO_CARD_OPTIONS);
        }
        return sortSections(sections);
    }, [isLiveTv, collectionType, liveTv.data, items.data, artists.data, programs.data, people.data, studios.data, videos.data]);

    const sources = isLiveTv ? [liveTv] : [
        items,
        ...(!collectionType || isMusic(collectionType) ? [artists] : []),
        ...(!collectionType || isMovies(collectionType) || isTVShows(collectionType) ? [people, studios] : []),
        ...(!collectionType ? [videos, programs] : [])
    ];
    return {
        data,
        isPending: sources.some(source => source.isLoading),
        isFetching: sources.some(source => source.isFetching),
        isError: sources.some(source => source.isError) || (isLiveTv && !!liveTv.data?.hasError),
        refetch: () => isLiveTv ? liveTv.refetch() :
            Promise.all(sources.filter(source => source.isError).map(source => source.refetch()))
    };
};
