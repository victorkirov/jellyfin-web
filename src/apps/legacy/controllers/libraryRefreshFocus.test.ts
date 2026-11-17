import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Movies from './movies/movies';
import Shows from './shows/tvshows';
import { createLibraryRefresh } from './libraryRefresh';
import { bindLibraryRail } from './libraryRail';
import autoFocuser from 'components/autoFocuser';

vi.mock('scripts/inputManager', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('scripts/libraryBrowser', () => ({ default: { getQueryPagingHtml: () => '' } }));
vi.mock('scripts/settings/userSettings', () => ({
    get: () => null, getSavedView: () => 'Poster', libraryPageSize: () => 100,
    loadQuerySettings: (_key: string, query: object) => query, saveQuerySettings: vi.fn()
}));
vi.mock('components/loading/loading', () => ({ default: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('components/images/imageLoader', () => ({ default: { lazyChildren: vi.fn() } }));
vi.mock('components/listview/listview', () => ({ default: { getListViewHtml: () => '<a class="card" href="#">Title</a>' } }));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: { getCardsHtml: () => '<a class="card" href="#">Title</a>' } }));
vi.mock('components/alphaPicker/alphaPicker', () => {
    class Picker {
        updateControls() {
            return undefined;
        }
    }
    return { default: Picker, AlphaPicker: Picker };
});
vi.mock('components/itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('components/filterdialog/filterIndicator', () => ({ getFilterStatus: vi.fn(), setFilterStatus: vi.fn() }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('lib/globalize', () => ({ default: { translate: (label: string) => label } }));
vi.mock('lib/focusManager', () => ({ default: {
    focus: (element: HTMLElement) => element.focus(),
    autoFocus: (container: HTMLElement) => {
        const target = container.querySelector<HTMLElement>('a,button');
        target?.focus();
        return target;
    }
} }));
vi.mock('components/autoFocuser', () => ({ default: { autoFocus: vi.fn((container: HTMLElement) => {
    if (document.activeElement !== document.body && document.activeElement?.isConnected) return document.activeElement;
    const target = container.querySelector<HTMLElement>('.card');
    target?.focus();
    return target;
}) } }));

type Result = { Items: { Name: string }[]; TotalRecordCount: number };
type ItemsContainer = HTMLElement & {
    fetchData?(): Promise<Result>;
    getItemsHtml?(items: Result['Items']): string;
    afterRefresh?(result: Result): void;
    refreshItems(): Promise<void>;
    pause(): void;
    resume(): Promise<void>;
};
let view: HTMLElement;
const result: Result = { Items: [{ Name: 'Title' }], TotalRecordCount: 1 };

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    vi.stubGlobal('ApiClient', { getCurrentUserId: () => 'user', getItems: vi.fn().mockResolvedValue(result) });
});
afterEach(() => {
    view?.dispatchEvent(new Event('viewbeforehide'));
    view?.dispatchEvent(new Event('viewdestroy'));
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

function setup(kind: string) {
    view = document.createElement('main');
    view.innerHTML = '<section class="pageTabContent"><div class="libraryRail"><div class="alphaPicker"></div><button class="btnSort">Sort</button><button class="btnFilter">Filter</button><button class="btnSelectView">View</button><button class="btnPlayAll">Play all</button><div class="paging"></div></div><div class="itemsContainer"></div></section>';
    document.body.appendChild(view);
    const tab = view.querySelector<HTMLElement>('section')!;
    const items = tab.querySelector<ItemsContainer>('.itemsContainer')!;
    items.pause = vi.fn();
    items.resume = () => Promise.resolve();
    items.refreshItems = async () => {
        const response = await items.fetchData!();
        items.innerHTML = items.getItemsHtml!(response.Items);
        items.afterRefresh!(response);
    };
    bindLibraryRail(view);
    let refresh: () => Promise<void>;
    if (kind === 'Shared') {
        const state = createLibraryRefresh({ view, focus: tab, getQuery: () => ({ StartIndex: 0 }), load: () => Promise.resolve(result), render: () => {
            items.innerHTML = '<a class="card" href="#">Title</a>';
        } });
        refresh = state.refresh;
    } else {
        const controller = kind === 'Movies' ? new Movies(view, { topParentId: 'library' }, tab, { mode: 'movies' }) : new Shows(view, { topParentId: 'library' }, tab);
        controller.initTab?.();
        refresh = controller.renderTab;
    }
    return { tab, refresh };
}

async function settle(refresh: () => Promise<void>) {
    await refresh();
    await vi.dynamicImportSettled();
}

describe.each(['Movies', 'Shows', 'Shared'])('%s refresh focus', kind => {
    it.each(['radio', 'checkbox'])('keeps a focused %s in its open Sort or Filter dialog', async type => {
        const { refresh } = setup(kind);
        await settle(refresh);
        const dialog = document.createElement('div');
        dialog.className = 'dialog opened';
        dialog.innerHTML = '<input type="' + type + '">';
        document.body.appendChild(dialog);
        const input = dialog.querySelector('input')!;
        input.focus();
        await settle(refresh);
        expect(document.activeElement).toBe(input);
    });

    it('uses the previous autofocus behavior for an ordinary refresh', async () => {
        const { tab, refresh } = setup(kind);
        await settle(refresh);
        const control = tab.querySelector<HTMLElement>('.btnSelectView')!;
        control.focus();
        vi.mocked(autoFocuser.autoFocus).mockClear();
        await settle(refresh);
        expect(document.activeElement).toBe(control);
        expect(autoFocuser.autoFocus).toHaveBeenCalledWith(tab);
    });
});

it('focuses the matching grid after a non-bubbling letter event reaches the shared refresh path', async () => {
    const { tab, refresh } = setup('Shared');
    await settle(refresh);
    tab.querySelector<HTMLElement>('.btnSort')!.focus();
    tab.querySelector('.alphaPicker')!.dispatchEvent(new CustomEvent('alphavaluechanged', { detail: { value: 'D' } }));
    await settle(refresh);
    expect(document.activeElement).toBe(tab.querySelector('.card'));
});
