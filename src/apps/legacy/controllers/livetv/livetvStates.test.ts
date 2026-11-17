import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Channels from './livetvchannels';
import Suggested from './livetvsuggested';

const { apiClient, filterQuery, loading } = vi.hoisted(() => ({
    apiClient: {
        getCurrentUserId: () => 'user', serverId: () => 'server',
        getLiveTvChannels: vi.fn(), getLiveTvPrograms: vi.fn(), getLiveTvRecommendedPrograms: vi.fn()
    },
    filterQuery: { current: undefined as Record<string, unknown> | undefined },
    loading: { show: vi.fn(), hide: vi.fn() }
}));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: { getCardsHtml: ({ items }: { items: { Name: string }[] }) => items.map(item => `<button>${item.Name}</button>`).join('') } }));
vi.mock('components/cardbuilder/utils/shape', () => ({ getBackdropShape: () => 'backdrop', getPortraitShape: () => 'portrait' }));
vi.mock('components/images/imageLoader', () => ({ default: { lazyChildren: vi.fn() } }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('components/loading/loading', () => ({ default: loading }));
vi.mock('components/maintabsmanager', () => ({}));
vi.mock('components/autoFocuser', () => ({ default: { autoFocus: (element: HTMLElement) => element.querySelector<HTMLElement>('button, a')?.focus() } }));
vi.mock('scripts/libraryBrowser', () => ({ default: { getQueryPagingHtml: () => 'paging' } }));
vi.mock('scripts/settings/userSettings', () => ({ libraryPageSize: () => 100, get: vi.fn() }));
vi.mock('scripts/inputManager', () => ({ default: {} }));
vi.mock('components/dashboard', () => ({ default: { getCurrentUserId: () => 'user' } }));
vi.mock('utils/events', () => ({ default: { on: vi.fn() } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('components/filterdialog/filterIndicator', () => ({
    getFilterStatus: (query: Record<string, unknown>) => !!query.IsFavorite,
    setFilterStatus: (_element: HTMLElement, query: Record<string, unknown>) => { filterQuery.current = query; }
}));
vi.mock('components/itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('elements/emby-tabs/emby-tabs', () => ({}));
vi.mock('components/buttons/emby-button', () => ({}));

function page() {
    const view = document.createElement('div');
    view.innerHTML = readFileSync('src/apps/legacy/controllers/livetv.html', 'utf8');
    document.body.append(view);
    return view;
}

beforeEach(() => {
    vi.stubGlobal('ApiClient', apiClient);
    apiClient.getLiveTvChannels.mockResolvedValue({ Items: [], TotalRecordCount: 0 });
    apiClient.getLiveTvPrograms.mockResolvedValue({ Items: [] });
    apiClient.getLiveTvRecommendedPrograms.mockResolvedValue({ Items: [] });
});
afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('Live TV channel response states', () => {
    it('explains a successful empty response and hides empty paging', async () => {
        const tab = page().querySelector('#channelsTab') as HTMLElement;
        new Channels(tab, {}, tab).renderTab();
        await vi.waitFor(() => expect(tab.textContent).toContain('LiveTvNoChannels'));
        expect(tab.querySelector('a')?.getAttribute('href')).toBe('#/home');
        expect([...tab.querySelectorAll('.paging')].every(element => element.classList.contains('hide'))).toBe(true);
    });

    it('distinguishes filtered emptiness and keeps the filter action', async () => {
        const tab = page().querySelector('#channelsTab') as HTMLElement;
        const controller = new Channels(tab, {}, tab);
        controller.renderTab();
        await vi.waitFor(() => expect(filterQuery.current).toBeDefined());
        filterQuery.current!.IsFavorite = true;
        controller.renderTab();
        await vi.waitFor(() => expect(tab.textContent).toContain('LiveTvNoMatchingChannels'));
        expect(tab.querySelector('.btnFilter')).not.toBeNull();
    });

    it('renders populated channels without an empty message', async () => {
        apiClient.getLiveTvChannels.mockResolvedValue({ Items: [{ Name: 'Channel one' }], TotalRecordCount: 1 });
        const tab = page().querySelector('#channelsTab') as HTMLElement;
        new Channels(tab, {}, tab).renderTab();
        await vi.waitFor(() => expect(tab.textContent).toContain('Channel one'));
        expect(tab.querySelector('.liveTvStatus')).toBeNull();
    });

    it('separates failure from emptiness and retries the same channel query', async () => {
        apiClient.getLiveTvChannels.mockRejectedValueOnce(new Error('offline'));
        const tab = page().querySelector('#channelsTab') as HTMLElement;
        new Channels(tab, {}, tab).renderTab();
        await vi.waitFor(() => expect(tab.textContent).toContain('LiveTvLoadError'));
        expect(tab.textContent).not.toContain('LiveTvNoChannels');
        expect(loading.hide).toHaveBeenCalled();
        expect(tab.querySelector('.liveTvStatus button')?.classList.contains('show-focus')).toBe(true);
        expect(tab.querySelector('.liveTvStatus a')?.classList.contains('show-focus')).toBe(true);
        apiClient.getLiveTvChannels.mockResolvedValue({ Items: [{ Name: 'Recovered' }], TotalRecordCount: 1 });
        tab.querySelector<HTMLButtonElement>('.liveTvStatus button')!.click();
        await vi.waitFor(() => expect(tab.textContent).toContain('Recovered'));
        expect(apiClient.getLiveTvChannels.mock.calls[1][0]).toBe(apiClient.getLiveTvChannels.mock.calls[0][0]);
        expect(tab.querySelector('.liveTvStatus')).toBeNull();
    });
});

describe('Live TV program categories', () => {
    it('suppresses empty category headings and links to channels', async () => {
        const view = page();
        const tab = view.querySelector('#suggestionsTab')!;
        new Suggested(view, {}).renderTab();
        await vi.waitFor(() => expect(tab.textContent).toContain('LiveTvNoPrograms'));
        expect([...tab.querySelectorAll('.verticalSection')].every(element => element.classList.contains('hide'))).toBe(true);
        expect(tab.querySelector('.liveTvStatus a')?.getAttribute('href')).toBe('#/livetv?tab=2');
    });

    it('keeps successful categories visible when a sibling request fails', async () => {
        apiClient.getLiveTvRecommendedPrograms.mockResolvedValue({ Items: [{ Name: 'On now' }] });
        apiClient.getLiveTvPrograms.mockRejectedValueOnce(new Error('offline'));
        const view = page();
        new Suggested(view, {}).renderTab();
        await vi.waitFor(() => expect(view.textContent).toContain('LiveTvPartialLoadError'));
        expect(view.querySelector('#activePrograms')?.classList.contains('hide')).toBe(false);
        expect(view.textContent).toContain('On now');
        expect(apiClient.getLiveTvRecommendedPrograms.mock.calls[0][0]).toEqual({
            userId: 'user', IsAiring: true, limit: 24, ImageTypeLimit: 1,
            EnableImageTypes: 'Primary,Thumb,Backdrop', EnableTotalRecordCount: false,
            Fields: 'ChannelInfo,PrimaryImageAspectRatio'
        });
        expect(apiClient.getLiveTvPrograms.mock.calls[1][0]).toEqual({
            userId: 'user', HasAired: false, limit: 12, IsMovie: true,
            EnableTotalRecordCount: false, Fields: 'ChannelInfo', EnableImageTypes: 'Primary,Thumb'
        });
    });
});
