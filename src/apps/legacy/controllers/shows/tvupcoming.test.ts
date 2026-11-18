import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UpcomingTab from './tvupcoming';
import cardBuilder from 'components/cardbuilder/cardBuilder';
import imageLoader from 'components/images/imageLoader';
import loading from 'components/loading/loading';
import focusManager from 'lib/focusManager';

vi.mock('components/cardbuilder/cardBuilder', () => ({ default: { getCardsHtml: vi.fn(({ items }) => items.map((item: { Id: string }) => '<a class="card" href="#">' + item.Id + '</a>').join('')) } }));
vi.mock('components/cardbuilder/utils/shape', () => ({ getBackdropShape: () => 'backdropoverflow' }));
vi.mock('components/images/imageLoader', () => ({ default: { lazyChildren: vi.fn() } }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('components/loading/loading', () => ({ default: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('scripts/datetime', () => ({ default: {
    parseISO8601Date: (date: string) => date,
    isRelativeDay: () => false,
    toLocaleDateString: (date: string) => date
} }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('components/itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('scripts/inputManager', () => ({ default: {} }));
vi.mock('lib/focusManager', () => ({ default: { focus: vi.fn((element: HTMLElement | null) => element?.focus()) } }));

const api = {
    getCurrentUserId: vi.fn(() => 'user'),
    getUrl: vi.fn(() => 'upcoming-url'),
    getJSON: vi.fn()
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockReturnValue(document.body);
    vi.stubGlobal('ApiClient', api);
    api.getJSON.mockResolvedValue({ Items: [] });
    document.body.innerHTML = '<button class="emby-tab-button emby-tab-button-active">Upcoming</button><button id="other">Other</button><main><section class="pageTabContent is-active"><div id="upcomingItems"></div><div class="noItemsMessage" style="display:none">No upcoming episodes.</div></section></main>';
});

afterEach(() => {
    vi.restoreAllMocks();
});

function openUpcoming() {
    const view = document.querySelector<HTMLElement>('main')!;
    const content = document.querySelector<HTMLElement>('section')!;
    const activeTab = document.querySelector<HTMLElement>('.emby-tab-button-active')!;
    activeTab.focus();
    const controller = new UpcomingTab(view, { topParentId: 'parent' }, content);
    controller.preRender();
    controller.renderTab();
    return { controller, view, content, activeTab };
}

describe('Upcoming tab characterization', () => {
    it('retains the query and groups cards by premiere date', async () => {
        api.getJSON.mockResolvedValue({ Items: [{ Id: 'first', PremiereDate: '2026-11-20' }, { Id: 'second', PremiereDate: '2026-11-21' }] });
        const { content } = openUpcoming();
        await Promise.resolve();
        expect(api.getUrl).toHaveBeenCalledWith('Shows/Upcoming', expect.objectContaining({ Limit: 48, UserId: 'user', ParentId: 'parent', EnableTotalRecordCount: false }));
        expect(content.querySelectorAll('.verticalSection')).toHaveLength(2);
        expect(content.querySelector('.card')?.textContent).toBe('first');
        expect(cardBuilder.getCardsHtml).toHaveBeenCalledWith(expect.objectContaining({ shape: 'backdropoverflow', preferThumb: true, allowBottomPadding: false }));
        expect(imageLoader.lazyChildren).toHaveBeenCalledWith(content.querySelector('#upcomingItems'));
        expect(loading.hide).toHaveBeenCalledTimes(1);
    });

    it('shows the empty message and no cards for an empty response', async () => {
        const { content } = openUpcoming();
        await Promise.resolve();
        expect(content.querySelector<HTMLElement>('.noItemsMessage')!.style.display).toBe('block');
        expect(content.querySelectorAll('.card')).toHaveLength(0);
    });
});

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => {
        resolve = done;
    });
    return { promise, resolve };
}

describe('Upcoming initial focus walk', () => {
    it('focuses the first upcoming card once after its response renders', async () => {
        api.getJSON.mockResolvedValue({ Items: [{ Id: 'first' }, { Id: 'second' }] });
        const { content } = openUpcoming();
        await Promise.resolve();
        expect(document.activeElement).toBe(content.querySelector('.card'));
        expect(focusManager.focus).toHaveBeenCalledTimes(1);
    });

    it('focuses the active tab once when there are no upcoming episodes', async () => {
        const { activeTab } = openUpcoming();
        await Promise.resolve();
        expect(focusManager.focus).toHaveBeenCalledExactlyOnceWith(activeTab);
    });

    it.each(['focus move', 'view hide', 'tab change'])('does not steal focus after %s while Upcoming loads', async action => {
        const result = deferred<{ Items: { Id: string }[] }>();
        api.getJSON.mockReturnValue(result.promise);
        const { view, content } = openUpcoming();
        if (action === 'focus move') document.querySelector<HTMLButtonElement>('#other')!.focus();
        if (action === 'view hide') view.dispatchEvent(new Event('viewbeforehide'));
        if (action === 'tab change') Object.defineProperty(content, 'offsetParent', { value: null });
        result.resolve({ Items: [{ Id: 'late' }] });
        await Promise.resolve();
        expect(focusManager.focus).not.toHaveBeenCalled();
    });
});
