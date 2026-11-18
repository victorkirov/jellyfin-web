import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { RecommendedParams } from './recommendedTypes';

type ChildOptions = { mode?: string };
type ChildTab = {
    initTab: Mock; preRender: Mock; renderTab: Mock; destroy: Mock;
    content: HTMLElement; options?: ChildOptions;
};
type ChildArgs = [HTMLElement, RecommendedParams, HTMLElement, ChildOptions?];
type TabEvent = { detail: { selectedTabIndex: string } };
type TabBindings = [HTMLElement, number, () => unknown, () => unknown,
    (event: TabEvent) => void, (event: TabEvent) => void, boolean?];
type RecommendedFactory = new (view: HTMLElement, params: RecommendedParams) => unknown;

const mocks = vi.hoisted(() => ({
    latest: vi.fn(),
    nextUp: vi.fn(),
    children: [] as ChildTab[],
    tabs: null as TabBindings | null,
    api: { basePath: 'https://test.invalid' }
}));
const childModule = vi.hoisted(() => ({ default: function (...args: ChildArgs) {
    const [, , content, options] = args;
    const tab = { initTab: vi.fn(), preRender: vi.fn(), renderTab: vi.fn(), destroy: vi.fn(), content, options };
    mocks.children.push(tab);
    return tab;
} }));
vi.mock('./movies/movies', () => childModule);
vi.mock('./movies/moviecollections', () => childModule);
vi.mock('./movies/moviegenres', () => childModule);
vi.mock('./shows/tvshows', () => childModule);
vi.mock('./shows/tvupcoming', () => childModule);
vi.mock('./shows/tvgenres', () => childModule);
vi.mock('./shows/tvstudios', () => childModule);
vi.mock('./shows/episodes', () => childModule);
vi.mock('./music/musicalbums', () => childModule);
vi.mock('./music/musicartists', () => childModule);
vi.mock('./music/musicplaylists', () => childModule);
vi.mock('./music/songs', () => childModule);
vi.mock('./music/musicgenres', () => childModule);
vi.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({ getLibraryApi: () => ({ getLatestMedia: mocks.latest }) }));
vi.mock('@jellyfin/sdk/lib/utils/api/show-api', () => ({ getShowApi: () => ({ getNextUp: mocks.nextUp }) }));
vi.mock('hooks/useApi', () => ({ useApi: vi.fn() }));
vi.mock('lib/jellyfin-apiclient/ServerConnections', () => ({ default: { getApi: () => mocks.api } }));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: { buildCards: vi.fn(), getCardsHtml: vi.fn(() => '') } }));
vi.mock('components/cardbuilder/utils/shape', () => ({ getBackdropShape: () => 'backdrop', getPortraitShape: () => 'portrait', getSquareShape: () => 'square' }));
vi.mock('components/images/imageLoader', () => ({ default: { lazyChildren: vi.fn() } }));
vi.mock('lib/focusManager', () => ({ default: { autoFocus: vi.fn(), focus: vi.fn(), isCurrentlyFocusable: () => false } }));
vi.mock('components/autoFocuser', () => ({ default: { autoFocus: vi.fn() } }));
vi.mock('components/favoriteitems', () => ({ default: { render: vi.fn() } }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('components/loading/loading', () => ({ default: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('components/maintabsmanager', () => ({
    setTabs: (...args: TabBindings) => { mocks.tabs = args; },
    getTabsElement: () => ({ triggerTabChange: () => mocks.tabs![5]({ detail: { selectedTabIndex: '1' } }) })
}));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('utils/dom', () => ({ default: { getWindowSize: () => ({ innerWidth: 1920 }) } }));
vi.mock('lib/globalize', () => ({ default: { translate: vi.fn((key: string) => key) } }));
vi.mock('scripts/inputManager', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('scripts/libraryMenu', () => ({ default: { getTopParentId: () => 'menu-parent', setTitle: vi.fn() } }));
vi.mock('scripts/settings/userSettings', () => ({ get: vi.fn(), useEpisodeImagesInNextUpAndResume: () => false }));
vi.mock('scripts/browser', () => ({ default: { mobile: false } }));
vi.mock('components/dashboard', () => ({ default: { navigate: vi.fn() } }));
vi.mock('elements/emby-scroller/emby-scroller', () => ({}));
vi.mock('components/itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('elements/emby-tabs/emby-tabs', () => ({}));
vi.mock('components/buttons/emby-button', () => ({}));

import Movies from './movies/moviesrecommended';
import Shows from './shows/tvrecommended';
import Music from './music/musicrecommended';
import cardBuilder from 'components/cardbuilder/cardBuilder';
import { playbackManager } from 'components/playback/playbackmanager';
import Events from 'utils/events';
import * as userSettings from 'scripts/settings/userSettings';
import { queryClient } from 'utils/query/queryClient';
import inputManager from 'scripts/inputManager';
import Dashboard from 'components/dashboard';
import globalize from 'lib/globalize';

const api = {
    getCurrentUserId: () => 'user', serverId: () => 'server',
    getItems: vi.fn(), getJSON: vi.fn(), getUrl: vi.fn(), getLatestItems: vi.fn(), getNextUpEpisodes: vi.fn(),
    subscribe: vi.fn(() => vi.fn())
};

function makeView(Factory: RecommendedFactory, params: RecommendedParams = { topParentId: 'parent' }) {
    const view = document.createElement('div');
    view.setAttribute('data-title', 'Library');
    view.innerHTML = Array.from({ length: 7 }, (_, index) => `<div class="pageTabContent" data-index="${index}"></div>`).join('');
    view.querySelector('[data-index="1"]')!.innerHTML = `
        <div id="resumableSection"><div id="resumableItems" class="itemsContainer"></div></div>
        <div id="recentlyAddedItems" class="itemsContainer"></div>
        <div id="latestItemsSection"><div id="latestEpisodesItems" class="itemsContainer"></div></div>
        <div class="noNextUpItems"></div><div id="nextUpItemsSection"><div id="nextUpItems" class="itemsContainer"></div></div>
        <div class="noItemsMessage"></div><div class="recommendations"></div>
        <div id="recentlyAddedSongs" class="itemsContainer"></div>
        <div id="recentlyPlayed"><div class="itemsContainer"></div></div>
        <div id="topPlayed"><div class="itemsContainer"></div></div>`;
    Reflect.construct(Factory, [view, params]);
    view.dispatchEvent(new Event('viewshow'));
    return view;
}

function select(index: number, preload = false) {
    mocks.tabs![preload ? 4 : 5]({ detail: { selectedTabIndex: String(index) } });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(globalize.translate).mockImplementation(key => key);
    mocks.children.length = 0;
    Object.assign(playbackManager, { _callbacks: {} });
    queryClient.clear();
    vi.stubGlobal('ApiClient', api);
    api.getItems.mockResolvedValue({ Items: [] });
    api.getJSON.mockResolvedValue([]);
    api.getLatestItems.mockResolvedValue([]);
    api.getNextUpEpisodes.mockResolvedValue({ Items: [] });
    mocks.latest.mockResolvedValue({ data: [{ Id: 'latest' }] });
    mocks.nextUp.mockResolvedValue({ data: { Items: [{ Id: 'next' }] } });
});

describe.each([
    { name: 'movies', Factory: Movies, count: 5, type: 'Movie', limit: 18, fields: ['PrimaryImageAspectRatio', 'MediaSourceCount'], images: ['Primary', 'Backdrop', 'Banner', 'Thumb'] },
    { name: 'shows', Factory: Shows, count: 6, type: 'Episode', limit: 30, fields: ['PrimaryImageAspectRatio'], images: ['Primary', 'Backdrop', 'Thumb'] },
    { name: 'music', Factory: Music, count: 7, type: 'Audio', limit: 27, fields: ['PrimaryImageAspectRatio'], images: ['Primary', 'Backdrop', 'Banner', 'Thumb'] }
])('$name recommended controller', ({ name, Factory, count, type, limit, fields, images }) => {
    it('handles Search commands and unregisters the same listener on hide', () => {
        vi.mocked(inputManager.on).mockImplementation((scope, listener) => scope.addEventListener('command', listener));
        vi.mocked(inputManager.off).mockImplementation((scope, listener) => scope.removeEventListener('command', listener));
        const view = makeView(Factory);
        try {
            const search = new CustomEvent('command', { detail: { command: 'search' }, cancelable: true });
            window.dispatchEvent(search);
            expect(search.defaultPrevented).toBe(true);
            expect(Dashboard.navigate).toHaveBeenCalledWith('search?collectionType=' + (name === 'shows' ? 'tvshows' : name) + '&parentId=parent');
            const next = new CustomEvent('command', { detail: { command: 'next' }, cancelable: true });
            window.dispatchEvent(next);
            expect(next.defaultPrevented).toBe(false);
            expect(Dashboard.navigate).toHaveBeenCalledTimes(1);
            view.dispatchEvent(new Event('viewbeforehide'));
            expect(inputManager.off).toHaveBeenCalledWith(window, vi.mocked(inputManager.on).mock.calls[0][1]);
            window.dispatchEvent(new CustomEvent('command', { detail: { command: 'search' }, cancelable: true }));
            expect(Dashboard.navigate).toHaveBeenCalledTimes(1);
        } finally {
            view.dispatchEvent(new Event('viewbeforehide'));
            view.dispatchEvent(new Event('viewdestroy'));
        }
    });

    it('preserves preloaded and completed tabs across switching and Back', async () => {
        const view = makeView(Factory);
        expect(userSettings.get).toHaveBeenCalledWith('landing-parent');
        for (let index = 0; index < count; index++) {
            select(index, true);
            select(index);
            await vi.waitFor(() => {
                if (index === 1) {
                    expect(mocks.latest).toHaveBeenCalled();
                } else {
                    expect(mocks.children).toHaveLength(index + (index > 1 ? 0 : 1));
                    expect(mocks.children[mocks.children.length - 1].renderTab).toHaveBeenCalled();
                }
            });
            select(index);
        }
        expect(mocks.children).toHaveLength(count - 1);
        for (const child of mocks.children) {
            expect(child.initTab).toHaveBeenCalledTimes(1);
            expect(child.renderTab).toHaveBeenCalledTimes(1);
        }
        view.dispatchEvent(new Event('viewbeforehide'));
        view.dispatchEvent(new Event('viewshow'));
        expect(mocks.tabs![1]).toBe(count - 1);
        select(0);
        await vi.dynamicImportSettled();
        expect(mocks.children[0].renderTab).toHaveBeenCalledTimes(1);
        for (const inactiveChild of mocks.children.slice(1)) {
            expect(inactiveChild.renderTab).toHaveBeenCalledTimes(1);
        }
        view.dispatchEvent(new Event('viewdestroy'));
        mocks.children.forEach(child => {
            expect(child.destroy).toHaveBeenCalledTimes(1);
        });
    });

    it('refreshes cached video rows after playback while retaining tab controllers', async () => {
        const view = makeView(Factory);
        select(0);
        await vi.waitFor(() => expect(mocks.children[0]?.renderTab).toHaveBeenCalledTimes(1));
        select(1);
        await vi.waitFor(() => expect(mocks.latest).toHaveBeenCalledTimes(1));
        Events.trigger(playbackManager, 'playbackstop', [{ state: { NowPlayingItem: { MediaType: 'Video' } } }]);
        const expectedRefreshes = Factory === Music ? 1 : 2;
        await vi.waitFor(() => expect(mocks.latest).toHaveBeenCalledTimes(expectedRefreshes));
        select(0);
        await vi.waitFor(() => expect(mocks.children[0].renderTab).toHaveBeenCalledTimes(expectedRefreshes));
        expect(mocks.children).toHaveLength(1);
        if (Factory === Shows) expect(mocks.nextUp).toHaveBeenCalledTimes(2);
        view.dispatchEvent(new Event('viewbeforehide'));
        view.dispatchEvent(new Event('viewdestroy'));
    });

    it('keeps row parameters and reuses cached latest media on a new visit', async () => {
        const first = makeView(Factory, { topParentId: 'parent', tab: '1' });
        select(1);
        await vi.waitFor(() => expect(mocks.latest).toHaveBeenCalledTimes(1));
        expect(mocks.latest).toHaveBeenLastCalledWith({
            userId: 'user', parentId: 'parent', includeItemTypes: [type], limit,
            fields, imageTypeLimit: 1, enableImageTypes: images
        }, expect.objectContaining({ signal: expect.anything() }));
        if (Factory !== Music) {
            await vi.waitFor(() => expect(cardBuilder.buildCards).toHaveBeenCalledWith([{ Id: 'latest' }], expect.anything()));
        }
        first.dispatchEvent(new Event('viewdestroy'));
        const second = makeView(Factory, { topParentId: 'parent', tab: '1' });
        select(1);
        const renderer = Factory === Music ? cardBuilder.getCardsHtml : cardBuilder.buildCards;
        const expectedCards = Factory === Movies ? 4 : 6;
        await vi.waitFor(() => expect(renderer).toHaveBeenCalledTimes(expectedCards));
        expect(mocks.latest).toHaveBeenCalledTimes(1);
        expect(api.getLatestItems).not.toHaveBeenCalled();
        if (Factory === Shows) {
            expect(mocks.nextUp).toHaveBeenCalledTimes(1);
            expect(mocks.nextUp).toHaveBeenCalledWith({
                userId: 'user', parentId: 'menu-parent', limit: 24,
                fields: ['PrimaryImageAspectRatio', 'DateCreated', 'MediaSourceCount'],
                imageTypeLimit: 1, enableImageTypes: ['Primary', 'Backdrop', 'Thumb'], enableTotalRecordCount: false
            }, expect.objectContaining({ signal: expect.anything() }));
        }
        second.dispatchEvent(new Event('viewdestroy'));
    });
});

it('retains recommendation heading escaping and legacy missing-name failures', async () => {
    const actualGlobalize = await vi.importActual<typeof import('lib/globalize')>('lib/globalize');
    actualGlobalize.defaultModule('recommendation-compatibility');
    await actualGlobalize.loadStrings({ name: 'recommendation-compatibility', strings: [{ lang: 'en-us', path: 'en-us.json' }] });
    vi.mocked(globalize.translate).mockImplementation(actualGlobalize.translate);
    type Recommendation = { RecommendationType: string; BaselineItemName?: string | null; Items: never[] };
    let renderRecommendations!: (recommendations: Recommendation[]) => void;
    api.getJSON.mockReturnValueOnce({ then: (render: typeof renderRecommendations) => {
        renderRecommendations = render;
        return Promise.resolve();
    } });
    const view = makeView(Movies);
    try {
        select(1);
        await vi.waitFor(() => expect(renderRecommendations).toBeTypeOf('function'));
        renderRecommendations([{ RecommendationType: 'SimilarToRecentlyPlayed', BaselineItemName: '<sample>', Items: [] }]);
        expect(view.querySelector('.recommendations h2')?.textContent).toBe('Because you watched <sample>');
        expect(view.querySelector('.recommendations h2')?.innerHTML).toBe('Because you watched &lt;sample&gt;');
        for (const RecommendationType of ['SimilarToRecentlyPlayed', 'SimilarToLikedItem', 'HasLikedDirector', 'HasLikedActor']) {
            for (const BaselineItemName of [undefined, null]) {
                expect(() => renderRecommendations([{ RecommendationType, BaselineItemName, Items: [] }])).toThrow(TypeError);
            }
        }
        renderRecommendations([{ RecommendationType: 'Unknown', Items: [] }]);
        expect(view.querySelector('.recommendations h2')?.textContent).toBe('');
    } finally {
        view.dispatchEvent(new Event('viewbeforehide'));
        view.dispatchEvent(new Event('viewdestroy'));
    }
});

it('review 3: leaving Suggestions while rows load does not refetch them on return', async () => {
    let resolveResume!: (result: { Items: never[] }) => void;
    api.getItems.mockReturnValue(new Promise(done => {
        resolveResume = done;
    }));
    const view = makeView(Movies);
    try {
        select(1);
        await vi.waitFor(() => expect(api.getItems).toHaveBeenCalledTimes(1));
        select(0);
        await vi.waitFor(() => expect(mocks.children[0]?.renderTab).toHaveBeenCalledTimes(1));
        resolveResume({ Items: [] });
        await vi.waitFor(() => expect(cardBuilder.buildCards).toHaveBeenCalledTimes(2));
        await vi.dynamicImportSettled();
        select(1);
        await vi.dynamicImportSettled();
        expect(api.getItems).toHaveBeenCalledTimes(1);
        expect(api.getJSON).toHaveBeenCalledTimes(1);
        expect(cardBuilder.buildCards).toHaveBeenCalledTimes(2);
    } finally {
        view.dispatchEvent(new Event('viewbeforehide'));
        view.dispatchEvent(new Event('viewdestroy'));
    }
});
