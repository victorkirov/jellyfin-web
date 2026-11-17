import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    settings: { enableThemeSongs: vi.fn(), enableThemeVideos: vi.fn() },
    fetchQuery: vi.fn(),
    getThemeMedia: vi.fn(),
    play: vi.fn(),
    stop: vi.fn()
}));

vi.mock('scripts/settings/userSettings', () => ({ currentSettings: mocks.settings }));
vi.mock('hooks/useItem', () => ({ getItemQuery: vi.fn() }));
vi.mock('utils/query/queryClient', () => ({ queryClient: { fetchQuery: mocks.fetchQuery } }));
vi.mock('utils/events.ts', () => ({ default: { on: vi.fn() } }));
vi.mock('lib/jellyfin-apiclient', () => ({
    ServerConnections: { getApi: vi.fn(), getApiClient: () => ({ getCurrentUserId: () => 'user' }) }
}));
vi.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({
    getLibraryApi: () => ({ getThemeMedia: mocks.getThemeMedia })
}));
vi.mock('./playback/playbackmanager', () => ({
    playbackManager: { play: mocks.play, stop: mocks.stop, isPlaying: () => false }
}));

import './themeMediaPlayer';

function showItem() {
    document.dispatchEvent(new CustomEvent('viewshow', {
        detail: { params: { serverId: 'server', id: 'item' }, options: {} }
    }));
}

describe('Theme media settings', () => {
    it('skips both requests when disabled and stops an existing theme', async () => {
        mocks.settings.enableThemeSongs.mockReturnValue(false);
        mocks.settings.enableThemeVideos.mockReturnValue(false);
        showItem();
        expect(mocks.fetchQuery).not.toHaveBeenCalled();
        expect(mocks.getThemeMedia).not.toHaveBeenCalled();

        mocks.play.mockResolvedValue(undefined);
        mocks.settings.enableThemeSongs.mockReturnValue(true);
        mocks.fetchQuery.mockResolvedValue({ Id: 'item', Type: 'Movie' });
        mocks.getThemeMedia.mockResolvedValue({
            data: { ThemeSongsResult: { OwnerId: 'item', Items: [{ Id: 'song', MediaType: 'Audio' }] } }
        });
        showItem();
        await vi.waitFor(() => expect(mocks.play).toHaveBeenCalledTimes(1));
        await Promise.resolve();
        mocks.settings.enableThemeSongs.mockReturnValue(false);
        showItem();
        expect(mocks.stop).toHaveBeenCalledTimes(1);
        expect(mocks.fetchQuery).toHaveBeenCalledTimes(1);
        expect(mocks.getThemeMedia).toHaveBeenCalledTimes(1);
    });
});
