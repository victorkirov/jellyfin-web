import { readFileSync } from 'node:fs';
import type { ItemDto } from 'types/base/models/item-dto';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { MediaType } from '@jellyfin/sdk/lib/generated-client/models/media-type';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ItemDetails from './index';
import { queryClient } from 'utils/query/queryClient';

const { apiClient, playbackManager, fixture, hideLoading, getListViewHtml, getSdkItem, api } = vi.hoisted(() => {
    const data = { item: null as ItemDto | null };
    const client = {
        getItem: vi.fn(() => Promise.resolve(data.item)),
        getCurrentUser: vi.fn(() => Promise.resolve({ Id: 'user', Policy: {} })),
        getCurrentUserId: () => 'user',
        getItems: vi.fn(() => Promise.resolve({ Items: [] })),
        getEpisodes: vi.fn(() => Promise.resolve({ Items: [] })),
        getSeasons: vi.fn(() => Promise.resolve({ Items: [] })),
        getLiveTvPrograms: vi.fn(() => Promise.resolve({ Items: [] })),
        getNextUpEpisodes: vi.fn(() => Promise.resolve({ Items: [] })),

        getSimilarItems: vi.fn<(...args: unknown[]) => Promise<{ Items: ItemDto[] }>>().mockResolvedValue({ Items: [] }),
        subscribe: vi.fn()
    };
    return { api: { basePath: 'https://test' }, getSdkItem: vi.fn(() => Promise.resolve({ data: data.item })), apiClient: client, fixture: data, hideLoading: vi.fn(), getListViewHtml: vi.fn(() => ''), playbackManager: { canPlay: () => true, getSupportedCommands: () => ['PlayMediaSource'], play: vi.fn() } };
});
const strings: Record<string, string> = JSON.parse(readFileSync('src/strings/en-us.json', 'utf8'));
const template = readFileSync('src/apps/legacy/controllers/itemDetails/index.html', 'utf8');
vi.mock('lib/globalize', () => ({ default: {
    translate: (key: string, value?: string | number) => (strings[key] || key).replace('{0}', String(value ?? '')),
    getCurrentDateTimeLocale: () => 'en-US'
} }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: () => apiClient, currentApiClient: () => apiClient, getApi: () => api } }));
vi.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({ getLibraryApi: () => ({ getItem: getSdkItem }) }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager }));
vi.mock('components/apphost', () => ({ appHost: { supports: () => false } }));
vi.mock('components/backdrop/backdrop', () => ({ clearBackdrop: vi.fn(), setBackdrops: vi.fn() }));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: { getCardsHtml: () => '<button>Similar movie</button>' } }));
vi.mock('components/cardbuilder/cardImage', () => ({ buildCardImage: () => '' }));
vi.mock('components/images/imageLoader', () => ({ default: { lazyChildren: vi.fn() } }));
vi.mock('components/itemContextMenu', () => ({ default: { getCommands: () => Promise.resolve([]) } }));
vi.mock('components/itemHelper', () => ({ default: {
    supportsMediaSourceSelection: () => true, canMarkPlayed: () => false, canRate: () => false,
    getDisplayName: (item: ItemDto) => item.Name, sortTracks: (first: { Index: number }, second: { Index: number }) => first.Index - second.Index
} }));
vi.mock('components/mediainfo/mediainfo', async importOriginal => {
    const original = await importOriginal<typeof import('components/mediainfo/mediainfo')>();
    return { default: { ...original.default, fillPrimaryMediaInfo: vi.fn(), fillSecondaryMediaInfo: vi.fn() } };
});
vi.mock('elements/emby-progressbar/emby-progressbar', () => ({}));
vi.mock('lib/focusManager', () => ({ default: { isCurrentlyFocusable: () => false, focus: vi.fn(), autoFocus: vi.fn(), getFocusableElements: () => [] } }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('components/listview/listview', () => ({ default: { getListViewHtml } }));
vi.mock('components/loading/loading', () => ({ default: { show: vi.fn(), hide: hideLoading } }));
vi.mock('components/itemDetails/ItemDetailsMetadataGroup', () => ({ default: vi.fn() }));
vi.mock('components/router/appRouter', () => ({ appRouter: {} }));
vi.mock('components/shortcuts', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('components/autoFocuser', () => ({ default: { autoFocus: vi.fn() } }));
vi.mock('scripts/playlistViewer', () => ({ default: { render: vi.fn() } }));
vi.mock('scripts/browser', () => ({ default: {} }));
vi.mock('scripts/libraryMenu', () => ({ default: { setTitle: vi.fn(), setTransparentMenu: vi.fn() } }));
vi.mock('scripts/settings/userSettings', () => ({ enableBackdrops: () => false }));
vi.mock('utils/dom', () => ({ default: { getWindowSize: () => ({ innerWidth: 1280 }) } }));
vi.mock('apps/legacy/renderComponent', () => ({ renderComponent: () => vi.fn() }));
vi.mock('components/itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('elements/emby-checkbox/emby-checkbox', () => ({}));
vi.mock('components/buttons/emby-button', () => ({}));
vi.mock('components/buttons/emby-playstatebutton', () => ({}));
vi.mock('components/buttons/emby-ratingbutton', () => ({}));
vi.mock('elements/emby-scroller/emby-scroller', () => ({}));
vi.mock('components/select/emby-select', () => ({}));

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IntersectionObserver', class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
    });
    queryClient.clear();
    document.body.innerHTML = template.replace(/\$\{(\w+)\}/g, (match, key) => strings[key] || key);
    document.querySelectorAll<HTMLSelectElement & { setLabel: () => void }>('select').forEach(select => {
        select.setLabel = vi.fn();
    });
    document.querySelectorAll<HTMLElement & { setItem: () => void }>('.btnPlaystate, .btnUserRating').forEach(button => {
        button.setItem = vi.fn();
    });
});

afterEach(() => {
    const page = document.querySelector('#itemDetailPage');
    page?.dispatchEvent(new Event('viewbeforehide'));
    page?.dispatchEvent(new Event('viewdestroy'));
    queryClient.clear();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

// The legacy page factory is constructed by ViewManagerPage but lacks a TS construct signature.
const DetailsController = ItemDetails as unknown as new (view: HTMLElement, params: { id: string; serverId: string }) => unknown;

it('keeps one visible heading after the actual details similar-items renderer fails and retries', async () => {
    const error = new Error('similar items offline');
    const reportError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    apiClient.getSimilarItems.mockRejectedValueOnce(error).mockResolvedValueOnce({
        Items: [{ Id: 'similar', ServerId: 'server', Type: BaseItemKind.Movie }]
    });
    fixture.item = { Id: 'movie', Name: 'Movie', ServerId: 'server', Type: BaseItemKind.Movie, MediaType: MediaType.Video };
    const page = document.querySelector<HTMLElement>('#itemDetailPage')!;
    const controller = new DetailsController(page, { id: 'movie', serverId: 'server' });
    expect(controller).toBeInstanceOf(DetailsController);
    page.dispatchEvent(new CustomEvent('viewshow', { detail: {} }));
    const section = page.querySelector<HTMLElement>('#similarCollapsible')!;
    await vi.waitFor(() => expect(section.previousElementSibling?.classList.contains('focusable')).toBe(true));
    const placeholder = section.previousElementSibling as HTMLElement;
    expect(placeholder.textContent).toBe(section.querySelector('h2')!.textContent);
    placeholder.focus();
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith('[DeferredSection] failed to load section', error));
    expect(apiClient.getSimilarItems).toHaveBeenCalledOnce();
    expect(section.classList.contains('hide')).toBe(true);
    expect(placeholder.isConnected).toBe(true);
    expect(document.activeElement).toBe(placeholder);
    expect([placeholder, section].filter(element => !element.classList.contains('hide'))).toHaveLength(1);
    placeholder.dispatchEvent(new FocusEvent('focusin'));
    await vi.waitFor(() => expect(apiClient.getSimilarItems).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(placeholder.isConnected).toBe(false));
    expect(section.classList.contains('hide')).toBe(false);
    expect(section.querySelector('.similarContent button')?.textContent).toBe('Similar movie');
});
