import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import HomeTab from 'apps/legacy/controllers/hometab';
import type { HomeRow } from './homeLifecycle';

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(), fetchViews: vi.fn(), fetchRow: vi.fn(), autoFocus: vi.fn(), resumeRow: vi.fn(), pauseRow: vi.fn()
}));
vi.mock('scripts/settings/userSettings', () => ({ get: (key: string) => ['resume', 'librarybuttons'][Number(key.replace('homesection', ''))] || 'none' }));
vi.mock('lib/focusManager', () => ({ default: { autoFocus: mocks.autoFocus } }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { currentApiClient: () => ({ getCurrentUser: mocks.getCurrentUser, serverId: () => 'server' }) } }));
vi.mock('lib/jellyfin-apiclient/ServerConnections', () => ({ default: { getApi: () => ({}) } }));
vi.mock('hooks/api/useUserViews', () => ({ getUserViewsQuery: () => ({ queryKey: ['views'] }) }));
vi.mock('utils/query/queryClient', () => ({ queryClient: { fetchQuery: mocks.fetchViews } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('components/itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('elements/emby-button/paper-icon-button-light', () => ({}));
vi.mock('elements/emby-scroller/emby-scroller', () => ({}));
vi.mock('components/buttons/emby-button', () => ({}));
vi.mock('./deferSection', () => ({ deferSection: () => () => undefined }));
vi.mock('./sectionComposition', () => ({
    loadSection: (page: HTMLElement, _client: unknown, _user: unknown, _settings: unknown, _views: unknown, section: string, index: number) => {
        const element = page.querySelector<HTMLElement>('.section' + index)!;
        if (section === 'librarybuttons') {
            element.innerHTML = '<button data-id="movies">Movies</button>';
        } else if (section === 'resume') {
            const row: HomeRow = Object.assign(document.createElement('div'), {
                fetchData: mocks.fetchRow,
                resume: (options: { refresh?: boolean }) => {
                    mocks.resumeRow(options);
                    return mocks.fetchRow();
                },
                pause: mocks.pauseRow
            });
            row.className = 'itemsContainer';
            element.appendChild(row);
        }
        return Promise.resolve();
    }
}));

beforeEach(() => {
    vi.resetAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ Id: 'user' });
    mocks.fetchViews.mockResolvedValue({ Items: [{ Id: 'movies' }] });
    mocks.fetchRow.mockResolvedValue(undefined);
    document.body.innerHTML = '<main><div class="sections"></div></main>';
});
afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
});

it('cold home opens a tile before rows settle and Back keeps the same tile, focus and DOM without duplicate fetches', async () => {
    let finishRows!: () => void;
    mocks.fetchRow.mockReturnValueOnce(new Promise<void>(resolve => {
        finishRows = resolve;
    }));
    const view = document.querySelector<HTMLElement>('main')!;
    const tab = new HomeTab(view, {});
    const pending = tab.onResume({ autoFocus: true });
    await vi.waitFor(() => expect(mocks.fetchRow).toHaveBeenCalledTimes(1));
    const tile = view.querySelector<HTMLButtonElement>('[data-id="movies"]')!;
    tile.focus();
    tile.addEventListener('click', () => tab.onPause());
    tile.click();
    await tab.onResume({ autoFocus: true });
    expect(view.querySelector('[data-id="movies"]')).toBe(tile);
    expect(document.activeElement).toBe(tile);
    expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(mocks.fetchViews).toHaveBeenCalledTimes(1);
    finishRows();
    await pending;
    expect(document.activeElement).toBe(tile);
    expect(mocks.autoFocus).not.toHaveBeenCalled();
    tab.destroy();
});

it('preserves composed tiles when paused before initial row resume and refreshes rows on Back', async () => {
    vi.useFakeTimers();
    const view = document.querySelector<HTMLElement>('main')!;
    const tab = new HomeTab(view, {});
    const pending = tab.onResume({});
    for (let index = 0; index < 12; index++) await Promise.resolve();
    const tile = view.querySelector<HTMLButtonElement>('[data-id="movies"]')!;
    expect(tile).not.toBeNull();
    expect(mocks.fetchRow).not.toHaveBeenCalled();
    tile.focus();
    tab.onPause();
    const restored = tab.onResume({});
    await vi.runAllTimersAsync();
    await Promise.all([pending, restored]);
    expect(view.querySelector('[data-id="movies"]')).toBe(tile);
    expect(document.activeElement).toBe(tile);
    expect(mocks.resumeRow).toHaveBeenCalledWith({ refresh: true });
    expect(mocks.fetchRow).toHaveBeenCalledTimes(1);
    expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(mocks.fetchViews).toHaveBeenCalledTimes(1);
    tab.destroy();
});

it('does not attach the inactive home settings-change listener', () => {
    const section = document.querySelector<HTMLElement>('.sections')!;
    const addListener = vi.spyOn(section, 'addEventListener');
    const tab = new HomeTab(document.querySelector<HTMLElement>('main')!, {});
    expect(addListener.mock.calls.some(([name]) => name === 'settingschange')).toBe(false);
    tab.destroy();
});

it('discards a pending initial views lookup on pause and retries it on the next resume', async () => {
    let finishViews!: (result: { Items: { Id: string }[] }) => void;
    mocks.fetchViews.mockReturnValueOnce(new Promise(resolve => {
        finishViews = resolve;
    }));
    const view = document.querySelector<HTMLElement>('main')!;
    const tab = new HomeTab(view, {});
    const pending = tab.onResume({ autoFocus: true });
    await vi.waitFor(() => expect(mocks.fetchViews).toHaveBeenCalledTimes(1));
    tab.onPause();
    finishViews({ Items: [{ Id: 'stale-library' }] });
    await pending;
    expect(view.querySelector('[data-id="movies"]')).toBeNull();
    expect(mocks.fetchRow).not.toHaveBeenCalled();
    expect(mocks.autoFocus).not.toHaveBeenCalled();
    await tab.onResume({});
    expect(view.querySelector('[data-id="movies"]')).not.toBeNull();
    expect(mocks.getCurrentUser).toHaveBeenCalledTimes(2);
    expect(mocks.fetchViews).toHaveBeenCalledTimes(2);
    tab.destroy();
});

it('retries failed initial rows without rebuilding the composed home', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.fetchRow.mockRejectedValueOnce(new Error('offline'));
    const view = document.querySelector<HTMLElement>('main')!;
    const tab = new HomeTab(view, {});
    await tab.onResume({});
    const tile = view.querySelector<HTMLButtonElement>('[data-id="movies"]')!;
    tile.focus();
    tab.onPause();
    await tab.onResume({});
    expect(view.querySelector('[data-id="movies"]')).toBe(tile);
    expect(document.activeElement).toBe(tile);
    expect(mocks.fetchRow).toHaveBeenCalledTimes(2);
    expect(mocks.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(mocks.fetchViews).toHaveBeenCalledTimes(1);
    tab.destroy();
});
