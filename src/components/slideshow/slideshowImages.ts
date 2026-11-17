import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models/user-dto';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { randomInt } from 'utils/number';
import type { ImageOptions } from 'lib/jellyfin-apiclient/connectionTypes';

type Client = NonNullable<ReturnType<typeof ServerConnections.getApiClient>>;
type Options = ImageOptions & { type?: string; tag?: string | null; index?: number };

/**
 * Retrieves an item's image URL from the API.
 * @param {object|string} item - Item used to generate the image URL.
 * @param {object} options - Options of the image.
 * @param {object} apiClient - API client instance used to retrieve the image.
 * @returns {null|string} URL of the item's image.
 */
function getImageUrl(item: BaseItemDto | string, options: Options, apiClient: Client) {
    options = options || {};
    options.type = options.type || 'Primary';

    if (typeof (item) === 'string') {
        return apiClient.getScaledImageUrl(item, options);
    }

    if (item.ImageTags?.[options.type]) {
        options.tag = item.ImageTags[options.type];
        return apiClient.getScaledImageUrl(item.Id!, options);
    }

    if (options.type === 'Primary' && item.AlbumId && item.AlbumPrimaryImageTag) {
        options.tag = item.AlbumPrimaryImageTag;
        return apiClient.getScaledImageUrl(item.AlbumId, options);
    }

    return null;
}

/**
 * Retrieves a backdrop's image URL from the API.
 * @param {object} item - Item used to generate the image URL.
 * @param {object} options - Options of the image.
 * @param {object} apiClient - API client instance used to retrieve the image.
 * @returns {null|string} URL of the item's backdrop.
 */
function getBackdropImageUrl(item: BaseItemDto, options: Options, apiClient: Client) {
    options = options || {};
    options.type = options.type || 'Backdrop';

    // If not resizing, get the original image
    if (!options.maxWidth && !options.width && !options.maxHeight && !options.height && !options.fillWidth && !options.fillHeight) {
        options.quality = 100;
    }

    if (item.BackdropImageTags?.length) {
        options.index = randomInt(0, item.BackdropImageTags.length - 1);
        options.tag = item.BackdropImageTags[options.index];
        return apiClient.getScaledImageUrl(item.Id!, options);
    }

    return null;
}

/**
 * Dispatches a request for an item's image to its respective handler.
 * @param {object} item - Item used to generate the image URL.
 * @returns {string} URL of the item's image.
 */
export function getImgUrl(item: BaseItemDto, user?: UserDto) {
    const api = ServerConnections.getApi(item.ServerId);
    const apiClient = ServerConnections.getApiClient(item)!;
    const imageOptions: Options = {};

    if (item.BackdropImageTags?.length) {
        return getBackdropImageUrl(item, imageOptions, apiClient);
    } else {
        if (api && item.MediaType === 'Photo' && user?.Policy!.EnableContentDownloading) {
            return getLibraryApi(api).getDownloadUrl({ itemId: item.Id! });
        }
        imageOptions.type = 'Primary';
        return getImageUrl(item, imageOptions, apiClient);
    }
}

