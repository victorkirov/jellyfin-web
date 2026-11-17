import listView from 'components/listview/listview';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { PLAYLIST_FIELDS } from 'utils/query/playlistFields';

export function getFetchPlaylistItemsFn(apiClient, itemId) {
    return function (queryOptions) {
        const query = {
            Fields: PLAYLIST_FIELDS,
            EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
            UserId: apiClient.getCurrentUserId(),
            ...queryOptions
        };
        return apiClient.getJSON(apiClient.getUrl(`Playlists/${itemId}/Items`, query));
    };
}

function getItemsHtmlFn(playlistId) {
    return function (items) {
        return listView.getListViewHtml({
            items,
            showIndex: false,
            playFromHere: true,
            action: 'playallfromhere',
            smallIcon: true,
            playlistId,
            showParentTitle: true
        });
    };
}

async function init(page, item) {
    const apiClient = ServerConnections.getApiClient(item.ServerId);

    if (!apiClient) {
        console.error('[PlaylistViewer] No ApiClient instance is available', { apiClient });
        return;
    }

    const elem = page.querySelector('#childrenContent .itemsContainer');
    elem.classList.add('vertical-list');
    elem.classList.remove('vertical-wrap');
    elem.fetchData = getFetchPlaylistItemsFn(apiClient, item.Id);
    elem.getItemsHtml = getItemsHtmlFn(item.Id);
}

function refresh(page) {
    page.querySelector('#childrenContent').classList.add('verticalSection-extrabottompadding');
    page.querySelector('#childrenContent .itemsContainer').refreshItems();
}

function render(page, item) {
    if (!page.playlistInit) {
        page.playlistInit = true;
        init(page, item)
            .finally(() => {
                refresh(page);
            });
    } else {
        refresh(page);
    }
}

const PlaylistViewer = {
    render
};

export default PlaylistViewer;
