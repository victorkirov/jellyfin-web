import type { ApiClient } from 'jellyfin-apiclient';
import { beforeEach, expect, it, vi } from 'vitest';
import focusManager from 'lib/focusManager';
import FavoritesTab from 'apps/legacy/controllers/favorites';
import { loadSections } from './favoriteitems';

const mocks = vi.hoisted(() => ({
    getItems: vi.fn(), getArtists: vi.fn(), getPeople: vi.fn(), getCardsHtml: vi.fn<(...args: unknown[]) => string>(() => '<button>Card</button>'),
    cardOptions: vi.fn<(section: unknown) => object | undefined>(),
    hide: vi.fn(), route: vi.fn((_route: string, params: { itemTypes: string }) => '#/list?itemTypes=' + params.itemTypes)
}));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { currentApiClient: () => window.ApiClient } }));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: { getCardsHtml: mocks.getCardsHtml } }));
vi.mock('components/router/appRouter', () => ({ appRouter: { getRouteUrl: mocks.route } }));
vi.mock('./favoriteSectionCatalog', async importOriginal => {
    const actual = await importOriginal<typeof import('./favoriteSectionCatalog')>();
    return {
        ...actual,
        getFavoriteCardOptions: (section: import('./favoriteSectionCatalog').FavoriteSection) => (
            mocks.cardOptions(section) || actual.getFavoriteCardOptions(section)
        )
    };
});
vi.mock('components/itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('elements/emby-scroller/emby-scroller', () => ({}));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('lib/focusManager', () => ({ default: { autoFocus: vi.fn(), focus: vi.fn((target: HTMLElement) => target?.focus()) } }));
vi.mock('scripts/inputManager', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('utils/dom', () => ({ default: { getWindowSize: () => ({ innerWidth: 1920 }), parentWithClass: (element: Element) => element.parentElement?.parentElement } }));
vi.mock('./images/imageLoader', () => ({ default: { lazyChildren: vi.fn() } }));
vi.mock('./loading/loading', () => ({ default: { show: vi.fn(), hide: mocks.hide } }));
vi.mock('utils/url', () => ({ getParameterByName: () => null }));

type Row = HTMLElement & {
    fetchData: () => Promise<unknown>;
    getItemsHtml: (items: { Id: string }[]) => string;
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.cardOptions.mockReset();
    mocks.getItems.mockResolvedValue({ Items: [{ Id: 'item' }] });
    mocks.getArtists.mockResolvedValue({ Items: [{ Id: 'artist' }] });
    window.ApiClient = {
        serverId: () => 'server', getCurrentUserId: () => 'user', getItems: mocks.getItems,
        getArtists: mocks.getArtists, getPeople: mocks.getPeople
    } as unknown as ApiClient;
    Object.assign(window, { CustomElements: { upgradeSubtree: vi.fn() } });
});

it('keeps preview parent scoping, artist fetching, limits and section identities', async () => {
    const page = document.createElement('main');
    page.innerHTML = '<div class="favoriteSections"></div>';
    loadSections(page, 'user', 'music-library', ['favoriteArtists', 'favoriteAlbums', 'favoriteSongs']);
    await vi.waitFor(() => expect(mocks.hide).toHaveBeenCalled());
    expect(page.querySelectorAll('.verticalSection')).toHaveLength(3);
    expect(mocks.getArtists).toHaveBeenCalledWith('user', expect.objectContaining({ ParentId: 'music-library', Limit: 20, SortBy: 'SortName' }));
    expect(mocks.getItems.mock.calls.map(call => call[1].IncludeItemTypes)).toEqual(['MusicAlbum', 'Audio']);
    expect(mocks.getCardsHtml.mock.calls.map(call => call[1])).toMatchSnapshot();
});

it('preserves the full page All routes and card options for the overlapping sections', () => {
    const view = document.createElement('main');
    view.innerHTML = '<div class="sections"></div>';
    const tab = new FavoritesTab(view, {});
    const rows = view.querySelectorAll<Row>('.itemsContainer');
    for (const index of [0, 1, 3, 10, 11, 12]) rows[index].getItemsHtml([{ Id: 'item' }]);
    expect(mocks.route.mock.calls.map(call => call[1].itemTypes)).toEqual(['Movie', 'Series', 'Episode', 'MusicArtist', 'MusicAlbum', 'Audio']);
    expect(mocks.getCardsHtml.mock.calls).toMatchSnapshot();
    tab.destroy();
});

it('keeps empty preview sections empty and single-section previews unlimited', async () => {
    mocks.getItems.mockResolvedValue({ Items: [] });
    const page = document.createElement('main');
    page.innerHTML = '<div class="favoriteSections"></div>';
    loadSections(page, 'user', undefined, ['favoriteMovies']);
    await vi.waitFor(() => expect(mocks.hide).toHaveBeenCalled());
    expect(mocks.getItems.mock.calls[0][1]).not.toHaveProperty('Limit');
    expect(mocks.getItems.mock.calls[0][1]).not.toHaveProperty('ParentId');
    expect(page.querySelector('.sectionfavoriteMovies')?.innerHTML).toBe('');
    expect(mocks.getCardsHtml).not.toHaveBeenCalled();
});

it('keeps all seven preview identities and requests on the shared catalog', async () => {
    const page = document.createElement('main');
    page.innerHTML = '<div class="favoriteSections"></div>';
    loadSections(page, 'user');
    await vi.waitFor(() => expect(mocks.hide).toHaveBeenCalled());
    expect(Array.from(page.querySelectorAll('h2'), heading => heading.textContent))
        .toEqual(['Movies', 'Shows', 'Episodes', 'Videos', 'Artists', 'Albums', 'Songs']);
    expect(mocks.getItems.mock.calls.map(call => call[1].IncludeItemTypes))
        .toEqual(['Movie', 'Series', 'Episode', 'Video,MusicVideo', 'MusicAlbum', 'Audio']);
    expect(mocks.getCardsHtml.mock.calls.every(call => !Object.prototype.hasOwnProperty.call(call[1], 'leadingButtons'))).toBe(true);
});

it('uses shared card-option changes in both preview and full-page callers', async () => {
    mocks.cardOptions.mockReturnValue({ cardCssClass: 'shared-option' });
    const view = document.createElement('main');
    view.innerHTML = '<div class="sections"></div><div class="favoriteSections"></div>';
    const tab = new FavoritesTab(view, {});
    view.querySelectorAll<Row>('.itemsContainer')[10].getItemsHtml([{ Id: 'artist' }]);
    loadSections(view, 'user', 'music-library', ['favoriteArtists']);
    await vi.waitFor(() => expect(mocks.hide).toHaveBeenCalled());
    expect(mocks.getCardsHtml.mock.calls).toHaveLength(2);
    for (const args of mocks.getCardsHtml.mock.calls) {
        const options = args.length === 1 ? args[0] : args[1];
        expect(options).toHaveProperty('cardCssClass', 'shared-option');
    }
    expect(mocks.cardOptions).toHaveBeenCalledTimes(2);
    tab.destroy();
});

it('9/13: empty Home Favorites focuses its active tab with one useful message', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
        return this.parentElement;
    });
    document.body.innerHTML = '<button class="emby-tab-button-active">Favorites</button><section><div class="sections"></div></section>';
    const view = document.querySelector<HTMLElement>('section')!;
    const tab = new FavoritesTab(view, {});
    for (const row of view.querySelectorAll<HTMLElement>('.itemsContainer')) Object.assign(row, { resume: () => Promise.resolve(), pause: vi.fn() });
    await tab.onResume({ autoFocus: true });
    await vi.waitFor(() => expect(document.activeElement).toBe(document.querySelector('button')));
    expect(focusManager.focus).toHaveBeenCalledTimes(1);
    expect(view.querySelector('.noFavoritesMessage:not(.hide)')?.textContent).toBe('LibraryNoFavorites');
    tab.destroy();
    document.body.innerHTML = '';
});

it('9: Home Favorites does not steal focus after navigation during row loading', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
        return this.parentElement;
    });
    document.body.innerHTML = '<button class="emby-tab-button-active">Favorites</button><section><div class="sections"></div></section>';
    const view = document.querySelector<HTMLElement>('section')!;
    const tab = new FavoritesTab(view, {});
    let resolve!: () => void;
    const pending = new Promise<void>(done => {
        resolve = done;
    });
    for (const row of view.querySelectorAll<HTMLElement>('.itemsContainer')) Object.assign(row, { resume: () => pending, pause: vi.fn() });
    const loading = tab.onResume({ autoFocus: true });
    document.querySelector<HTMLButtonElement>('button')!.focus();
    resolve();
    await loading;
    await Promise.resolve();
    expect(focusManager.focus).not.toHaveBeenCalled();
    expect(focusManager.autoFocus).not.toHaveBeenCalled();
    tab.destroy();
    document.body.innerHTML = '';
});
