import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindLibraryRail, focusLibraryContent } from './libraryRail';
import { bindLibraryPaging } from './libraryPaging';
import inputManager from 'scripts/inputManager';

vi.mock('scripts/inputManager', () => ({ default: {
    on: (target: EventTarget, listener: EventListener) => target.addEventListener('command', listener),
    off: (target: EventTarget, listener: EventListener) => target.removeEventListener('command', listener)
} }));
vi.mock('lib/focusManager', () => ({ default: {
    focus: (element: HTMLElement | null) => element?.focus(),
    autoFocus: (element: HTMLElement) => {
        const target = element.querySelector<HTMLElement>('a,button');
        target?.focus();
        return target;
    }
} }));
vi.mock('scripts/libraryBrowser', () => ({ default: { getQueryPagingHtml: ({ startIndex, limit, totalRecordCount }: { startIndex: number; limit: number; totalRecordCount: number }) => '<button class="btnPreviousPage" ' + (startIndex ? '' : 'disabled') + '>Previous</button><button class="btnNextPage" ' + (startIndex + limit >= totalRecordCount ? 'disabled' : '') + '>Next</button>' } }));
vi.mock('scripts/settings/userSettings', () => ({}));
vi.mock('lib/globalize', () => ({ default: { translate: (label: string) => label } }));
let view: HTMLElement;

afterEach(() => {
    view?.dispatchEvent(new Event('viewdestroy'));
    document.body.innerHTML = '';
});

function setup(rail = true, count = 66) {
    document.body.innerHTML = '<button class="emby-tab-button emby-tab-button-active">Movies</button><main><section class="pageTabContent">'
        + (rail ? '<div class="libraryRail"><button class="alphaPickerTrigger">A–Z</button><button class="btnSort">Sort</button><button class="btnFilter">Filter</button><button class="btnSelectView">View</button><div class="paging"></div></div>' : '')
        + '<div class="itemsContainer">' + Array.from({ length: count }, (_, index) => `<a href="#" class="card">${index}</a>`).join('')
        + '</div><div class="paging"></div></section></main>';
    view = document.querySelector('main')!;
    const tab = view.querySelector<HTMLElement>('section')!;
    const cards = Array.from(tab.querySelectorAll<HTMLElement>('.card'));
    const jump = tab.querySelector<HTMLElement>('.alphaPickerTrigger');
    for (const element of document.querySelectorAll<HTMLElement>('*')) Object.defineProperty(element, 'offsetParent', { configurable: true, value: document.body });
    cards.forEach((card, index) => {
        Object.defineProperty(card, 'offsetTop', { configurable: true, value: Math.floor(index / 6) * 500 });
    });
    bindLibraryRail(view);
    view.dispatchEvent(new Event('viewshow'));
    return { tab, cards, jump, activeTab: document.querySelector<HTMLElement>('.emby-tab-button-active')! };
}
function key(command: string) {
    const event = new CustomEvent('command', { detail: { command }, bubbles: true, cancelable: true });
    document.activeElement!.dispatchEvent(event);
    return event.defaultPrevented;
}

describe('approved library focus walks', () => {
    it('1: initial library focus enters the first card', () => {
        const { tab, cards } = setup();
        focusLibraryContent(tab);
        expect(document.activeElement).toBe(cards[0]);
    });
    it('2–3: every first-row column goes Up to the active tab and Down returns to that card', () => {
        const { cards, activeTab } = setup();
        for (const card of cards.slice(0, 6)) {
            card.focus();
            key('up');
            expect(document.activeElement).toBe(activeTab);
            key('down');
            expect(document.activeElement).toBe(card);
        }
    });
    it('4–5: Left enters Jump without scrolling, Right restores the row-eleven card', () => {
        const { cards, jump } = setup();
        for (const card of [cards[0], cards[60]]) {
            card.focus();
            const scroll = window.pageYOffset;
            key('left');
            expect(document.activeElement).toBe(jump);
            expect(window.pageYOffset).toBe(scroll);
            key('right');
            expect(document.activeElement).toBe(card);
        }
    });
    it('6: interior Left stays with spatial navigation; the first column enters the rail', () => {
        const { cards, jump } = setup();
        cards[14].focus();
        expect(key('left')).toBe(false);
        cards[13].focus();
        expect(key('left')).toBe(false);
        cards[12].focus();
        key('left');
        expect(document.activeElement).toBe(jump);
    });
    it('7: repeated Right at the row end stays on that card', () => {
        const { cards } = setup();
        cards[5].focus();
        for (let press = 0;
            press < 3;
            press++) {
            key('right');
            expect(document.activeElement).toBe(cards[5]);
        }
    });
    it('8–11: re-confirming the active dialog letter returns to the first filtered card', () => {
        const { tab, cards } = setup();
        tab.querySelector('.alphaPickerTrigger')!.dispatchEvent(new CustomEvent('alphavalueconfirmed', { bubbles: true }));
        expect(document.activeElement).toBe(cards[0]);
    });
    it('12: rail follows DOM order, clamps at ends and ignores Back', () => {
        const { tab, jump } = setup();
        jump!.focus();
        key('up');
        expect(document.activeElement).toBe(jump);
        for (const selector of ['.btnSort', '.btnFilter', '.btnSelectView']) {
            key('down');
            expect(document.activeElement).toBe(tab.querySelector(selector));
        }
        key('down');
        expect(document.activeElement).toBe(tab.querySelector('.btnSelectView'));
        expect(key('back')).toBe(false);
    });
    it('13: last row enters bottom Next and paging then focuses the first new card', async () => {
        const { tab, cards } = setup();
        const query = { StartIndex: 0, Limit: 66 };
        bindLibraryPaging({ view: tab, query, totalRecordCount: 255, isLoading: () => false, getRequestId: () => 1, refresh: () => Promise.resolve() });
        cards[65].focus();
        key('down');
        expect(document.activeElement).toBe(tab.querySelectorAll('.btnNextPage')[1]);
        (document.activeElement as HTMLElement).click();
        await vi.waitFor(() => expect(document.activeElement).toBe(cards[0]));
        expect(query.StartIndex).toBe(66);
    });
    it('14: rail paging restores the recreated pressed button, then a later letter focuses cards', async () => {
        const { tab, cards } = setup();
        const query = { StartIndex: 0, Limit: 66 };
        const bind = () => bindLibraryPaging({ view: tab, query, totalRecordCount: 255, isLoading: () => false, getRequestId: () => 1, refresh: async () => {
            bind();
            focusLibraryContent(tab);
        } });
        bind();
        tab.querySelector<HTMLElement>('.libraryRail .btnNextPage')!.click();
        await vi.waitFor(() => expect(document.activeElement).toBe(tab.querySelector('.libraryRail .btnNextPage')));
        await Promise.resolve();
        await Promise.resolve();
        focusLibraryContent(tab);
        expect(document.activeElement).toBe(cards[0]);
    });
    it('14: keeps rail Next focused on the last page and ignores further presses', async () => {
        const { tab } = setup();
        const query = { StartIndex: 0, Limit: 66 };
        const refresh = vi.fn(async () => {
            bind();
        });
        const bind = () => bindLibraryPaging({ view: tab, query, totalRecordCount: 132, isLoading: () => false, getRequestId: () => 1, refresh });
        bind();
        tab.querySelector<HTMLElement>('.libraryRail .btnNextPage')!.click();
        await vi.waitFor(() => expect(document.activeElement).toBe(tab.querySelector('.libraryRail .btnNextPage')));
        expect(document.activeElement?.getAttribute('aria-disabled')).toBe('true');
        (document.activeElement as HTMLElement).click();
        expect(query.StartIndex).toBe(66);
        expect(refresh).toHaveBeenCalledTimes(1);
    });
    it('15: normal Back is not captured and listeners stop while the view is hidden', () => {
        const { cards } = setup();
        cards[20].focus();
        expect(key('back')).toBe(false);
        view.dispatchEvent(new Event('viewbeforehide'));
        expect(key('left')).toBe(false);
        view.dispatchEvent(new Event('viewshow'));
        expect(document.activeElement).toBe(cards[20]);
    });
    it('16: Suggestions/Genres horizontal edges stay on their own row', () => {
        const { cards, tab } = setup(false);
        cards[6].focus();
        key('left');
        expect(document.activeElement).toBe(cards[6]);
        cards[11].focus();
        key('right');
        expect(document.activeElement).toBe(cards[11]);
        expect(tab.querySelector('.itemsContainer')?.classList.contains('focuscontainer-x')).toBe(true);
    });
    it('keeps the rail reachable from tabs when Favorites or a filter has no cards', () => {
        const { tab, jump, activeTab } = setup(true, 0);
        focusLibraryContent(tab);
        expect(document.activeElement).toBe(jump);
        activeTab.focus();
        key('down');
        expect(document.activeElement).toBe(jump);
        key('right');
        expect(document.activeElement).toBe(jump);
    });
    it('registers once per showing and unregisters once across hide and destroy', () => {
        const on = vi.spyOn(inputManager, 'on');
        const off = vi.spyOn(inputManager, 'off');
        setup();
        view.dispatchEvent(new Event('viewshow'));
        expect(on).toHaveBeenCalledTimes(1);
        view.dispatchEvent(new Event('viewbeforehide'));
        view.dispatchEvent(new Event('viewdestroy'));
        expect(off).toHaveBeenCalledTimes(1);
    });
    it('falls back when the remembered card is removed and skips hidden Jump', () => {
        const { cards, jump, tab } = setup();
        Object.defineProperty(jump, 'offsetParent', { value: null, configurable: true });
        cards[6].focus();
        key('left');
        expect(document.activeElement).toBe(tab.querySelector('.btnSort'));
        cards[6].remove();
        key('right');
        expect(document.activeElement).toBe(cards[0]);
    });
});
