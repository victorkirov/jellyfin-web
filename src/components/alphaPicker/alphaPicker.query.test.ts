import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import TvShowsController from '../../apps/legacy/controllers/shows/tvshows';
import MoviesController from '../../apps/legacy/controllers/movies/movies';

const getItems = vi.hoisted(() => vi.fn<(userId: string, query: unknown) => Promise<unknown>>().mockResolvedValue({ Items: [] }));
vi.mock('components/loading/loading', () => ({ default: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('scripts/settings/userSettings', () => ({
    libraryPageSize: () => 100,
    get: vi.fn(),
    getSavedView: vi.fn(),
    loadQuerySettings: (_key: string, query: object) => Object.assign(query, { StartIndex: 100 })
}));
vi.mock('scripts/libraryBrowser', () => ({ default: {} }));
vi.mock('components/images/imageLoader', () => ({ default: {} }));
vi.mock('components/listview/listview', () => ({ default: {} }));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: {} }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('components/filterdialog/filterIndicator', () => ({ getFilterStatus: vi.fn(), setFilterStatus: vi.fn() }));
vi.mock('components/itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('components/buttons/emby-button', () => ({}));
vi.mock('elements/emby-button/paper-icon-button-light', () => ({}));
vi.mock('lib/focusManager', () => ({ default: { focus: (element: HTMLElement) => element.focus() } }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('components/dialogHelper/dialogHelper', () => ({ default: {
    createDialog: () => document.createElement('div'),
    open: (dialog: HTMLElement) => document.body.appendChild(dialog),
    close: (dialog: HTMLElement) => {
        dialog.remove();
        dialog.dispatchEvent(new Event('close'));
    }
} }));
vi.mock('material-design-icons-iconfont', () => ({}));

afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

it('sends letter, number and clear selections through the movie library query', () => {
    getItems.mockResolvedValue({ Items: [] });
    vi.stubGlobal('ApiClient', { getItems, getCurrentUserId: () => 'user' });
    const tab = document.createElement('main');
    tab.innerHTML = '<div class="alphaPicker"></div><div class="itemsContainer"></div><button class="btnFilter"></button><button class="btnSort"></button><button class="btnSelectView"></button><button class="btnPlayAll"></button>';
    document.body.appendChild(tab);
    const items = Object.assign(tab.querySelector('.itemsContainer')!, {
        fetchData: () => Promise.resolve({}), refreshItems: vi.fn(), pause: vi.fn()
    });
    items.refreshItems.mockImplementation(() => items.fetchData());
    const controller = new MoviesController(tab, { topParentId: 'library' }, tab, { mode: 'movies' });
    controller.initTab();
    for (const value of ['Z', '#', '']) {
        tab.querySelector<HTMLButtonElement>('.alphaPickerTrigger')!.click();
        document.querySelector<HTMLButtonElement>('.alphaPickerDialog [data-value="' + value + '"]')!.click();
        const query = getItems.mock.lastCall?.[1];
        expect(query).toMatchObject({ StartIndex: 0, ParentId: 'library', IncludeItemTypes: 'Movie' });
        if (value === '#') {
            expect(query).toHaveProperty('NameLessThan', 'A');
            expect(query).not.toHaveProperty('NameStartsWith');
        } else {
            expect(query).toHaveProperty('NameStartsWith', value || null);
            expect(query).not.toHaveProperty('NameLessThan');
        }
    }
    expect(items.refreshItems).toHaveBeenCalledTimes(3);
    controller.alphaPicker.destroy();
    controller.destroy();
});

it('keeps the TV shows trigger before a full page and sends the selected filter query', () => {
    getItems.mockReturnValue(new Promise(() => {
        return;
    }));
    vi.stubGlobal('ApiClient', { getItems, getCurrentUserId: () => 'user' });
    const page = document.createElement('main');
    page.innerHTML = readFileSync('src/apps/legacy/controllers/shows/tvrecommended.html', 'utf8');
    document.body.appendChild(page);
    const tab = page.querySelector<HTMLElement>('#seriesTab')!;
    const items = tab.querySelector('.itemsContainer')!;
    const controller = new TvShowsController(page, { topParentId: 'shows' }, tab);
    items.innerHTML = Array.from({ length: 100 }, () => '<button>Show</button>').join('');
    const trigger = tab.querySelector<HTMLButtonElement>('.alphaPickerTrigger')!;
    expect(trigger.compareDocumentPosition(items) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const value of ['Z', '#', '']) {
        trigger.click();
        document.querySelector<HTMLButtonElement>('.alphaPickerDialog [data-value="' + value + '"]')!.click();
        const query = getItems.mock.lastCall?.[1];
        expect(query).toMatchObject({ StartIndex: 0, ParentId: 'shows', IncludeItemTypes: 'Series' });
        if (value === '#') {
            expect(query).toHaveProperty('NameLessThan', 'A');
            expect(query).not.toHaveProperty('NameStartsWith');
        } else {
            expect(query).toHaveProperty('NameStartsWith', value || null);
            expect(query).not.toHaveProperty('NameLessThan');
        }
    }
    controller.alphaPicker.destroy();
});
