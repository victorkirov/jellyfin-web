import { beforeEach, describe, expect, it, vi } from 'vitest';

import MovieGenres from '../../apps/legacy/controllers/movies/moviegenres';
import TvGenres from '../../apps/legacy/controllers/shows/tvgenres';
import cardBuilder from '../cardbuilder/cardBuilder';
import lazyLoader from '../lazyLoader/lazyLoaderIntersectionObserver';
import { appRouter } from '../router/appRouter';
import * as userSettings from '../../scripts/settings/userSettings';
import type { GenreTabController } from './genreTab';
import focusManager from 'lib/focusManager';

vi.mock('components/cardbuilder/cardBuilder', () => ({ default: { buildCards: vi.fn() } }));
vi.mock('components/cardbuilder/utils/shape', () => ({
    getBackdropShape: (scroll: boolean) => scroll ? 'backdropoverflow' : 'backdrop',
    getPortraitShape: (scroll: boolean) => scroll ? 'portraitoverflow' : 'portrait'
}));
vi.mock('lib/layoutManager', () => ({ default: { desktop: false, tv: true } }));
vi.mock('components/lazyLoader/lazyLoaderIntersectionObserver', () => ({ default: { lazyChildren: vi.fn() } }));
vi.mock('components/loading/loading', () => ({ default: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('components/router/appRouter', () => ({ appRouter: { getRouteUrl: vi.fn(() => '/genre') } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('scripts/settings/userSettings', () => ({
    getSavedView: vi.fn(() => 'Thumb'),
    loadQuerySettings: vi.fn(),
    saveQuerySettings: vi.fn(),
    saveViewSetting: vi.fn()
}));
vi.mock('components/buttons/emby-button', () => ({}));
vi.mock('lib/focusManager', () => ({ default: { focus: vi.fn((element: HTMLElement) => element.focus()) } }));

const api = {
    getCurrentUserId: vi.fn(() => 'user'),
    getGenres: vi.fn(),
    getItems: vi.fn()
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains('pageTabContent') && !this.classList.contains('is-active')) return null;
        return this.parentElement;
    });
    vi.mocked(cardBuilder.buildCards).mockReset();
    document.body.innerHTML = '';
    vi.stubGlobal('ApiClient', api);
    api.getGenres.mockResolvedValue({ Items: [{ Id: 'genre', Name: '<Comedy>' }] });
    api.getItems.mockResolvedValue({ Items: Array(10).fill({ Id: 'movie' }) });
});

describe.each([
    { name: 'movies', Factory: MovieGenres, itemType: 'Movie', key: 'moviegenres', context: 'movies', padding: true },
    { name: 'shows', Factory: TvGenres, itemType: 'Series', key: 'seriesgenres', context: 'tvshows', padding: false }
])('$name genre tab', ({ Factory, itemType, key, context, padding }) => {
    it('preserves the initial view and settings key', () => {
        const tab = Reflect.construct(Factory, [document.createElement('div'), { topParentId: 'parent' }, document.createElement('div')]) as GenreTabController;
        expect(tab.getCurrentViewStyle()).toBe(itemType === 'Movie' ? 'Thumb' : 'Poster');
        expect(userSettings.loadQuerySettings).toHaveBeenCalledWith('parent-' + key, expect.objectContaining({ IncludeItemTypes: itemType, ParentId: 'parent' }));
        expect(tab.getViewStyles()).toEqual(['Poster', 'PosterCard', 'Thumb', 'ThumbCard']);
    });

    it('preserves TV rendering', async () => {
        const content = document.createElement('div');
        content.innerHTML = '<div id="items"></div>';
        const tab = Reflect.construct(Factory, [document.createElement('div'), { topParentId: 'parent' }, content]) as GenreTabController;
        for (const style of ['Poster', 'PosterCard', 'Thumb', 'ThumbCard']) {
            tab.setCurrentViewStyle(style);
            await Promise.resolve();
            expect(api.getGenres).toHaveBeenLastCalledWith('user', expect.objectContaining({ IncludeItemTypes: itemType, ParentId: 'parent' }));
            expect(appRouter.getRouteUrl).toHaveBeenLastCalledWith(expect.anything(), { context, parentId: 'parent' });
            expect(content.querySelector('h2')?.textContent).toBe('<Comedy>');
            const row = content.querySelector('.itemsContainer');
            expect(row?.classList.contains('smoothScrollX')).toBe(true);
            expect(row?.classList.contains('hiddenScrollX')).toBe(true);
            expect(row?.classList.contains('vertical-wrap')).toBe(false);
            const callback = vi.mocked(lazyLoader.lazyChildren).mock.lastCall![1];
            const unobserve = vi.fn();
            callback({ isIntersecting: false, target: row! } as IntersectionObserverEntry, { unobserve, observe: vi.fn(), disconnect: vi.fn(), takeRecords: () => [], root: null, rootMargin: '50%', thresholds: [0] });
            expect(unobserve).not.toHaveBeenCalled();
            callback({ isIntersecting: true, target: row! } as IntersectionObserverEntry, { unobserve, observe: vi.fn(), disconnect: vi.fn(), takeRecords: () => [], root: null, rootMargin: '50%', thresholds: [0] });
            await Promise.resolve();
            expect(unobserve).toHaveBeenCalledWith(row);
            const thumb = style === 'Thumb' || style === 'ThumbCard';
            expect(api.getItems).toHaveBeenLastCalledWith('user', expect.objectContaining({
                IncludeItemTypes: itemType, Limit: 10, GenreIds: 'genre', ParentId: 'parent',
                EnableImageTypes: thumb ? 'Primary,Backdrop,Thumb' : 'Primary'
            }));
            expect(cardBuilder.buildCards).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
                shape: (thumb ? 'backdrop' : 'portrait') + 'overflow'
            }));
            if (style === 'Poster') {
                expect(cardBuilder.buildCards).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ allowBottomPadding: padding }));
            }
            expect(content.querySelector('.material-icons')?.classList.contains('hide')).toBe(false);
            expect(userSettings.saveViewSetting).toHaveBeenLastCalledWith('parent-' + key, style);
            expect(userSettings.saveQuerySettings).toHaveBeenLastCalledWith('parent-' + key, expect.anything());
        }
    });

    it('preserves empty-state translations', async () => {
        api.getGenres.mockResolvedValue({ Items: [] });
        const content = document.createElement('div');
        content.innerHTML = '<div id="items"></div>';
        const tab = Reflect.construct(Factory, [document.createElement('div'), { topParentId: 'parent' }, content]) as GenreTabController;
        tab.preRender();
        tab.renderTab();
        await Promise.resolve();
        expect(content.querySelector('h1')?.textContent).toBe('MessageNothingHere');
        expect(content.querySelector('p')?.textContent).toBe('MessageNoGenresAvailable');
    });
});

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => {
        resolve = done;
    });
    return { promise, resolve };
}

async function openGenres() {
    document.body.innerHTML = '<button class="emby-tab-button-active">Genres</button><button id="other">Other</button><main><section class="pageTabContent is-active"><div id="items"></div></section></main>';
    const view = document.querySelector<HTMLElement>('main')!;
    const content = document.querySelector<HTMLElement>('section')!;
    const activeTab = document.querySelector<HTMLButtonElement>('.emby-tab-button-active')!;
    activeTab.focus();
    const tab = Reflect.construct(MovieGenres, [view, { topParentId: 'parent' }, content]) as GenreTabController;
    tab.preRender();
    tab.renderTab();
    await Promise.resolve();
    return { view, content, activeTab, tab };
}

function revealRow(row: Element) {
    const callback = vi.mocked(lazyLoader.lazyChildren).mock.lastCall![1];
    callback({ isIntersecting: true, target: row } as IntersectionObserverEntry, {
        unobserve: vi.fn(), observe: vi.fn(), disconnect: vi.fn(), takeRecords: () => [], root: null, rootMargin: '50%', thresholds: [0]
    });
}

describe('genre initial focus walk', () => {
    beforeEach(() => {
        vi.mocked(cardBuilder.buildCards).mockImplementation((items, options) => {
            if (!Array.isArray(items)) throw new Error('Expected item array');
            options!.itemsContainer!.innerHTML = items.map(item => '<a href="#" class="card">' + item.Id + '</a>').join('');
        });
    });

    it.each(['stay', 'focus move', 'view hide', 'view destroy', 'tab change'])('finishes a pending row focus only when still owned: %s', async action => {
        api.getGenres.mockResolvedValue({ Items: [{ Id: 'next', Name: 'Next' }] });
        const result = deferred<{ Items: { Id: string }[] }>();
        api.getItems.mockReturnValue(result.promise);
        const { view, content } = await openGenres();
        const row = content.querySelector<HTMLElement>('.itemsContainer')!;
        row.tabIndex = -1;
        row.focus();
        revealRow(row);
        if (action === 'focus move') document.querySelector<HTMLButtonElement>('#other')!.focus();
        if (action === 'view hide') view.dispatchEvent(new Event('viewbeforehide'));
        if (action === 'view destroy') view.dispatchEvent(new Event('viewdestroy'));
        if (action === 'tab change') content.classList.remove('is-active');
        result.resolve({ Items: [{ Id: 'next-card' }] });
        await Promise.resolve();
        await Promise.resolve();
        if (action === 'stay') expect(document.activeElement).toBe(row.querySelector('.card'));
        else expect(focusManager.focus).not.toHaveBeenCalled();
    });

    it.each(['empty', 'failure'])('returns pending focus to the row title after %s', async state => {
        vi.spyOn(console, 'error').mockReturnValue(undefined);
        api.getGenres.mockResolvedValue({ Items: [{ Id: 'next', Name: 'Next' }] });
        if (state === 'empty') api.getItems.mockResolvedValue({ Items: [] });
        else api.getItems.mockRejectedValue(new Error('row unavailable'));
        const { content } = await openGenres();
        const row = content.querySelector<HTMLElement>('.itemsContainer')!;
        row.tabIndex = -1;
        row.focus();
        revealRow(row);
        await vi.waitFor(() => expect(document.activeElement).toBe(content.querySelector('.more')));
    });

    it.each(['empty', 'failure'])('clears the pending marker when an unfocused row finishes: %s', async state => {
        vi.spyOn(console, 'error').mockReturnValue(undefined);
        const result = deferred<{ Items: { Id: string }[] }>();
        api.getItems.mockReturnValue(state === 'failure' ? result.promise.then(() => {
            throw new Error('row unavailable');
        }) : result.promise);
        const { content } = await openGenres();
        const row = content.querySelector<HTMLElement>('.itemsContainer')!;
        revealRow(row);
        expect(row.dataset.loading).toBe('true');
        result.resolve({ Items: [] });
        await vi.waitFor(() => expect(row.dataset.loading).toBeUndefined());
    });

    it('focuses the first genre card once when lazy rows resolve out of order', async () => {
        api.getGenres.mockResolvedValue({ Items: [{ Id: 'first', Name: 'First' }, { Id: 'second', Name: 'Second' }, { Id: 'third', Name: 'Third' }] });
        const first = deferred<{ Items: { Id: string }[] }>();
        const second = deferred<{ Items: { Id: string }[] }>();
        const third = deferred<{ Items: { Id: string }[] }>();
        api.getItems.mockImplementation((_user, query) => {
            if (query.GenreIds === 'first') return first.promise;
            return query.GenreIds === 'second' ? second.promise : third.promise;
        });
        const { content } = await openGenres();
        const rows = content.querySelectorAll('.itemsContainer');
        revealRow(rows[0]);
        revealRow(rows[1]);
        second.resolve({ Items: [{ Id: 'second-card' }] });
        await Promise.resolve();
        expect(focusManager.focus).not.toHaveBeenCalled();
        first.resolve({ Items: [{ Id: 'first-card' }] });
        await vi.waitFor(() => expect(document.activeElement).toBe(rows[0].querySelector('.card')));
        revealRow(rows[2]);
        third.resolve({ Items: [{ Id: 'third-card' }] });
        await Promise.resolve();
        expect(document.activeElement).toBe(rows[0].querySelector('.card'));
        expect(focusManager.focus).toHaveBeenCalledTimes(1);
    });

    it.each(['focus move', 'view hide', 'tab change'])('does not steal focus after %s while the first row loads', async action => {
        const result = deferred<{ Items: { Id: string }[] }>();
        api.getItems.mockReturnValue(result.promise);
        const { view, content } = await openGenres();
        revealRow(content.querySelector('.itemsContainer')!);
        if (action === 'focus move') document.querySelector<HTMLButtonElement>('#other')!.focus();
        if (action === 'view hide') view.dispatchEvent(new Event('viewbeforehide'));
        if (action === 'tab change') content.classList.remove('is-active');
        result.resolve({ Items: [{ Id: 'late' }] });
        await Promise.resolve();
        await Promise.resolve();
        expect(focusManager.focus).not.toHaveBeenCalled();
    });

    it('focuses the active tab once for empty genres', async () => {
        api.getGenres.mockResolvedValue({ Items: [] });
        const { activeTab } = await openGenres();
        expect(focusManager.focus).toHaveBeenCalledExactlyOnceWith(activeTab);
    });
});
