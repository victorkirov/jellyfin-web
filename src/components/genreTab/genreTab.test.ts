import { beforeEach, describe, expect, it, vi } from 'vitest';

import MovieGenres from '../../apps/legacy/controllers/movies/moviegenres';
import TvGenres from '../../apps/legacy/controllers/shows/tvgenres';
import cardBuilder from '../cardbuilder/cardBuilder';
import lazyLoader from '../lazyLoader/lazyLoaderIntersectionObserver';
import { appRouter } from '../router/appRouter';
import * as userSettings from '../../scripts/settings/userSettings';
import type GenreTab from './genreTab';

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

const api = {
    getCurrentUserId: vi.fn(() => 'user'),
    getGenres: vi.fn(),
    getItems: vi.fn()
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ApiClient', api);
    api.getGenres.mockResolvedValue({ Items: [{ Id: 'genre', Name: '<Comedy>' }] });
    api.getItems.mockResolvedValue({ Items: Array(10).fill({ Id: 'movie' }) });
});

describe.each([
    { name: 'movies', Factory: MovieGenres, itemType: 'Movie', key: 'moviegenres', context: 'movies', padding: true },
    { name: 'shows', Factory: TvGenres, itemType: 'Series', key: 'seriesgenres', context: 'tvshows', padding: false }
])('$name genre tab', ({ Factory, itemType, key, context, padding }) => {
    it('preserves the initial view and settings key', () => {
        const tab = Reflect.construct(Factory, [document.createElement('div'), { topParentId: 'parent' }, document.createElement('div')]) as InstanceType<typeof GenreTab>;
        expect(tab.getCurrentViewStyle()).toBe(itemType === 'Movie' ? 'Thumb' : 'Poster');
        expect(userSettings.loadQuerySettings).toHaveBeenCalledWith('parent-' + key, expect.objectContaining({ IncludeItemTypes: itemType, ParentId: 'parent' }));
        expect(tab.getViewStyles()).toEqual(['Poster', 'PosterCard', 'Thumb', 'ThumbCard']);
    });

    it('preserves TV rendering', async () => {
        const content = document.createElement('div');
        content.innerHTML = '<div id="items"></div>';
        const tab = Reflect.construct(Factory, [document.createElement('div'), { topParentId: 'parent' }, content]) as InstanceType<typeof GenreTab>;
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
        const tab = Reflect.construct(Factory, [document.createElement('div'), { topParentId: 'parent' }, content]) as InstanceType<typeof GenreTab>;
        tab.preRender();
        tab.renderTab();
        await Promise.resolve();
        expect(content.querySelector('h1')?.textContent).toBe('MessageNothingHere');
        expect(content.querySelector('p')?.textContent).toBe('MessageNoGenresAvailable');
    });
});
