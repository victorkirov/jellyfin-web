import { clearBackdrop, setBackdropImages, setBackdrops } from '../components/backdrop/backdrop';
import * as userSettings from './settings/userSettings';
import libraryMenu from './libraryMenu';
import { pageClassOn } from '../components/dashboard';
import { queryClient } from 'utils/query/queryClient';
import { getBrandingOptionsQuery } from 'hooks/useBrandingOptions';
import { SPLASHSCREEN_URL } from 'constants/branding';
import { ServerConnections } from 'lib/jellyfin-apiclient';

const cache = new Map();
const maxCachedLists = 32;
let navigationGeneration = 0;

function enabled() {
    return userSettings.enableBackdrops();
}

function getBackdropItemIds(apiClient, userId, types, parentId) {
    const key = JSON.stringify([apiClient.serverId(), apiClient.serverAddress(), userId, types || '', parentId || '']);
    const data = cache.get(key);

    if (data) {
        return Promise.resolve(data);
    }

    const options = {
        SortBy: 'IsFavoriteOrLiked,Random',
        Limit: 20,
        Recursive: true,
        IncludeItemTypes: types,
        ImageTypes: 'Backdrop',
        ParentId: parentId,
        EnableTotalRecordCount: false,
        MaxOfficialRating: parentId ? '' : 'PG-13'
    };
    return apiClient.getItems(userId, options).then(function (result) {
        const images = result.Items.map(function (i) {
            return {
                Id: i.Id,
                tag: i.BackdropImageTags[0],
                ServerId: i.ServerId
            };
        });
        if (cache.size >= maxCachedLists) {
            cache.delete(cache.keys().next().value);
        }
        cache.set(key, images);
        return images;
    });
}

function showBackdrop(type, parentId, generation) {
    const apiClient = ServerConnections.currentApiClient();

    if (apiClient) {
        const userId = apiClient.getCurrentUserId();
        getBackdropItemIds(apiClient, userId, type, parentId).then(function (images) {
            if (generation !== navigationGeneration || apiClient !== ServerConnections.currentApiClient() || userId !== apiClient.getCurrentUserId()) return;
            if (images.length) {
                setBackdrops(images.map(function (i) {
                    return { Id: i.Id, ServerId: i.ServerId, BackdropImageTags: [i.tag] };
                }));
            } else {
                clearBackdrop();
            }
        }).catch(function (error) {
            console.error('Failed to load backdrop images', error);
            if (generation === navigationGeneration) clearBackdrop();
        });
    }
}

async function showSplashScreen(generation) {
    const api = ServerConnections.getApi();
    const brandingOptions = await queryClient.fetchQuery(getBrandingOptionsQuery(api));
    if (generation !== navigationGeneration || api !== ServerConnections.getApi()) return;
    if (brandingOptions.SplashscreenEnabled) {
        setBackdropImages([
            api.getUri(SPLASHSCREEN_URL, { t: Date.now() })
        ]);
    } else {
        clearBackdrop();
    }
}

pageClassOn('pageshow', 'page', function () {
    const generation = ++navigationGeneration;
    const page = this;

    if (!page.classList.contains('selfBackdropPage')) {
        if (page.classList.contains('backdropPage')) {
            const type = page.getAttribute('data-backdroptype');
            if (type === 'splashscreen') {
                showSplashScreen(generation).catch(function (error) {
                    console.error('Failed to load splash screen', error);
                    if (generation === navigationGeneration) clearBackdrop();
                });
            } else if (enabled()) {
                const parentId = page.classList.contains('globalBackdropPage') ? '' : libraryMenu.getTopParentId();
                showBackdrop(type, parentId, generation);
            } else {
                page.classList.remove('backdropPage');
                clearBackdrop();
            }
        } else {
            clearBackdrop();
        }
    }
});
