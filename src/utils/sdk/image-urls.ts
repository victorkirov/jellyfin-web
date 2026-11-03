import type { Api } from '@jellyfin/sdk/lib/api';
import type { ImageType } from '@jellyfin/sdk/lib/generated-client/models/image-type';

type ImageUrlParams = Record<string, string | number | boolean | null | undefined>;

/**
 * Gets an item image url.
 * Builds the same url as getImageApi(api).getItemImageUrlById without going through axios, which
 * takes several milliseconds per image on low-end TVs.
 */
export function getItemImageUrl(api: Api, itemId: string, imageType: ImageType, params: ImageUrlParams = {}) {
    const url = `${api.basePath}/Items/${itemId}/Images/${imageType}`;
    const query = Object.keys(params)
        .filter(key => params[key] != null)
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
        .join('&');

    return query ? `${url}?${query}` : url;
}
