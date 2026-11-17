import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFetchPlaylistItemsFn } from './playlistViewer';
import { onClick } from 'components/shortcuts';

vi.mock('components/playback/playbackmanager', () => ({ playbackManager: { play: vi.fn(), queue: vi.fn() } }));
vi.mock('scripts/inputManager', () => ({ default: {} }));
vi.mock('components/router/appRouter', () => ({ appRouter: {} }));
vi.mock('lib/globalize', () => ({ default: {} }));
vi.mock('components/toast/toast', () => ({ default: {} }));
vi.mock('scripts/settings/userSettings', () => ({}));

vi.mock('components/listview/listview', () => ({ default: {} }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: {} }));

afterEach(() => {
    document.body.innerHTML = '';
});

describe('Playlist item requests', () => {
    function setup() {
        const apiClient = {
            getCurrentUserId: () => 'user',
            getUrl: vi.fn(() => 'playlist-url'),
            getJSON: vi.fn().mockResolvedValue({ Items: [] })
        };
        return { apiClient, fetchData: getFetchPlaylistItemsFn(apiClient, 'playlist') };
    }

    it('omits playback-only fields while rendering the list', async () => {
        const { apiClient, fetchData } = setup();
        await fetchData();
        expect(apiClient.getUrl).toHaveBeenCalledWith('Playlists/playlist/Items', {
            Fields: 'PrimaryImageAspectRatio,MediaSourceCount',
            EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
            UserId: 'user'
        });
    });

    it('forwards the queue start index and requested playback fields', async () => {
        const { apiClient, fetchData } = setup();
        const options = { StartIndex: 3, Fields: 'PrimaryImageAspectRatio,MediaSourceCount,Chapters,Trickplay' };
        await fetchData(options);
        expect(apiClient.getUrl).toHaveBeenCalledWith('Playlists/playlist/Items', {
            ...options,
            EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
            UserId: 'user'
        });
        expect(options.StartIndex).toBe(3);
    });

    it.each(['playallfromhere', 'queueallfromhere'])('requests playback fields for %s', action => {
        const { apiClient, fetchData } = setup();
        const container = Object.assign(document.createElement('div'), { fetchData });
        container.className = 'itemsContainer';
        container.innerHTML = '<button class="listItem itemAction" data-id="first"></button>'
            + '<button class="listItem itemAction" data-id="second" data-playlistid="playlist" data-serverid="server"></button>';
        const card = container.querySelectorAll('button')[1];
        card.setAttribute('data-action', action);
        container.addEventListener('click', onClick);
        document.body.appendChild(container);
        card.click();
        expect(apiClient.getUrl).toHaveBeenCalledWith('Playlists/playlist/Items', {
            Fields: 'PrimaryImageAspectRatio,MediaSourceCount,Chapters,Trickplay',
            EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
            UserId: 'user',
            ...(action === 'queueallfromhere' ? { StartIndex: 1 } : {})
        });
    });
});
