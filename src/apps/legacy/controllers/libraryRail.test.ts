import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { bindLibraryRail, focusLibraryContent, createLibraryInitialFocus, focusLibraryRefresh } from './libraryRail';
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
vi.mock('scripts/libraryBrowser', async () => {
    const { getQueryPagingHtml } = await import('scripts/libraryPagingMarkup');
    return { default: { getQueryPagingHtml } };
});
vi.mock('lib/scrollManager', () => ({ default: { isEnabled: () => false } }));
vi.mock('scripts/settings/userSettings', () => ({}));
vi.mock('lib/globalize', () => ({ default: {
    getCurrentLocale: () => 'en-US',
    translate: (label: string, ...values: (string | number)[]) => values.reduce<string>((text, value, index) =>
        text.replace('{' + index + '}', String(value)), label === 'ListPaging' ? '{0}-{1} of {2}' : label)
} }));
let view: HTMLElement;

beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
        return this.parentElement;
    });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

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
    it('12: rail follows DOM order, reaches the tab above and ignores Back', () => {
        const { tab, jump, activeTab } = setup();
        jump!.focus();
        key('up');
        expect(document.activeElement).toBe(activeTab);
        jump!.focus();
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
    it.each(['Movies', 'TV'])('leaves Down from %s Suggestions to spatial navigation when resume is hidden', () => {
        const { tab, activeTab } = setup(false, 0);
        activeTab.textContent = 'Suggestions';
        tab.innerHTML = '<div class="hide" id="resumableSection"><div class="itemsContainer" id="resumableItems"></div></div><div class="itemsContainer"><a href="#" class="card">Latest title</a></div>';
        Object.defineProperty(tab.querySelector('.card'), 'offsetParent', { value: document.body });
        activeTab.focus();
        expect(key('down')).toBe(false);
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

describe('SR4 library boundary regressions', () => {
    it('2/15: bottom paging stays on Down and at horizontal ends; Up restores the card', () => {
        const { tab, cards } = setup();
        bindLibraryPaging({ view: tab, query: { StartIndex: 66, Limit: 66 }, totalRecordCount: 255, isLoading: () => false, getRequestId: () => 1, refresh: vi.fn() });
        cards[64].focus();
        key('down');
        const next = document.activeElement;
        expect(key('down')).toBe(true);
        expect(document.activeElement).toBe(next);
        key('right');
        expect(document.activeElement).toBe(next);
        key('left');
        expect(document.activeElement).toBe(tab.querySelectorAll('.btnPreviousPage')[1]);
        key('left');
        expect(document.activeElement).toBe(tab.querySelectorAll('.btnPreviousPage')[1]);
        key('up');
        expect(document.activeElement).toBe(cards[64]);
    });
    it('7: deep card to Jump to tab and Down returns to the same card and scrollY', () => {
        const { cards, activeTab } = setup();
        Object.defineProperty(window, 'pageYOffset', { configurable: true, value: 5358 });
        const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
        cards[60].focus();
        key('left');
        key('up');
        expect(document.activeElement).toBe(activeTab);
        key('down');
        expect(document.activeElement).toBe(cards[60]);
        expect(scroll).toHaveBeenLastCalledWith(0, 5358);
    });
    it('15: a short last row preserves the preferred column for Up', () => {
        const { cards } = setup(true, 15);
        cards[11].focus();
        expect(key('down')).toBe(true);
        expect(document.activeElement).toBe(cards[14]);
        key('up');
        expect(document.activeElement).toBe(cards[11]);
        key('up');
        expect(document.activeElement).toBe(cards[5]);
    });
    it('15: replacing cards discards the old preferred column and remembered paging target', () => {
        const { cards, tab } = setup(true, 15);
        cards[11].focus();
        key('down');
        const container = tab.querySelector('.itemsContainer')!;
        const replacement = cards.map(card => card.cloneNode(true) as HTMLElement);
        container.innerHTML = '';
        replacement.forEach(card => {
            container.appendChild(card);
        });
        replacement.forEach((card, index) => {
            Object.defineProperty(card, 'offsetTop', { value: Math.floor(index / 6) * 500 });
        });
        replacement[7].focus();
        key('down');
        expect(document.activeElement).toBe(replacement[13]);
        key('up');
        expect(document.activeElement).toBe(replacement[7]);
    });
    it('20: Networks has the same tab return memory without a rail', () => {
        const { tab, cards, activeTab } = setup(false);
        tab.id = 'studiosTab';
        cards[4].focus();
        key('up');
        expect(document.activeElement).toBe(activeTab);
        key('down');
        expect(document.activeElement).toBe(cards[4]);
    });
});

it('4/6/13: rail paging keeps labelled slots on all list states and hides zero counts', () => {
    const { tab, jump } = setup();
    for (const totalRecordCount of [255, 3, 0]) {
        const refresh = vi.fn();
        bindLibraryPaging({ view: tab, query: { StartIndex: 0, Limit: 66 }, totalRecordCount, isLoading: () => false, getRequestId: () => 1, refresh });
        const buttons = tab.querySelectorAll<HTMLButtonElement>('.libraryRail .paging button');
        expect(buttons).toHaveLength(2);
        expect(Array.from(buttons).map(button => button.querySelector('.libraryRailLabel')?.textContent)).toEqual(['Previous', 'Next']);
        jump!.focus();
        key('down');
        key('down');
        key('down');
        key('down');
        expect(document.activeElement).toBe(buttons[0]);
        buttons[0].click();
        expect(refresh).not.toHaveBeenCalled();
        if (totalRecordCount < 66) {
            expect(buttons[1].getAttribute('aria-disabled')).toBe('true');
            buttons[1].click();
            expect(refresh).not.toHaveBeenCalled();
        }
        if (!totalRecordCount) expect(tab.querySelectorAll('.listPaging > span:not(.hide)')).toHaveLength(0);
    }
});

it('9: initial focus chooses the first visible section once, and navigation cancels late focus', () => {
    const { tab, cards, jump } = setup();
    const finish = createLibraryInitialFocus(view, tab);
    finish();
    expect(document.activeElement).toBe(cards[0]);
    cards[5].focus();
    finish();
    expect(document.activeElement).toBe(cards[5]);
    const late = createLibraryInitialFocus(view, tab);
    jump!.focus();
    late();
    expect(document.activeElement).toBe(jump);
    const hidden = createLibraryInitialFocus(view, tab);
    view.dispatchEvent(new Event('viewbeforehide'));
    hidden();
    expect(document.activeElement).toBe(jump);
});

it('15: horizontal browsing resets the preferred column even when it returns to the short-row card', () => {
    const { cards } = setup(true, 15);
    cards[11].focus();
    key('down');
    expect(document.activeElement).toBe(cards[14]);
    expect(key('left')).toBe(false);
    cards[13].focus();
    expect(key('right')).toBe(false);
    cards[14].focus();
    key('up');
    expect(document.activeElement).toBe(cards[8]);
});

it('review 1: Genres tab Down reaches its first heading and first-card Up returns to that heading', async () => {
    const { tab, cards, activeTab } = setup(false, 2);
    const header = document.createElement('a');
    header.href = '#genre';
    header.className = 'sectionTitleTextButton btnMoreFromGenre';
    header.textContent = 'Action';
    tab.insertBefore(header, tab.firstChild);
    const targets = [activeTab, header, ...cards];
    targets.forEach((target, index) => {
        const top = Math.min(index, 2) * 100;
        vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ x: 100, y: top, left: 100, top, right: 200, bottom: top + 40, width: 100, height: 40, toJSON: () => ({}) });
    });
    const { default: spatial } = await vi.importActual<typeof import('lib/focusManager')>('lib/focusManager');
    function walk(command: 'up' | 'down') {
        if (!key(command)) {
            const source = document.activeElement as HTMLElement;
            if (command === 'down') spatial.moveDown(source, { container: document.body, focusableElements: targets });
            else spatial.moveUp(source, { container: document.body, focusableElements: targets });
        }
    }
    activeTab.focus();
    walk('down');
    expect(document.activeElement).toBe(header);
    walk('down');
    expect(document.activeElement).toBe(cards[0]);
    walk('up');
    expect(document.activeElement).toBe(header);
});

it('review 2: an empty letter refresh and repeated selection stay on Jump', () => {
    const { tab, jump } = setup(true, 0);
    jump!.focus();
    jump!.dispatchEvent(new CustomEvent('alphavaluechanged', { bubbles: true }));
    expect(focusLibraryRefresh(tab)).toBe(true);
    expect(document.activeElement).toBe(jump);
    jump!.dispatchEvent(new CustomEvent('alphavalueconfirmed', { bubbles: true }));
    expect(document.activeElement).toBe(jump);
    expect(window.scrollTo).not.toHaveBeenCalled();
});

it('review 2: the initial empty-tab decision focuses the active tab instead of Jump', () => {
    const { tab, activeTab } = setup(true, 0);
    activeTab.focus();
    createLibraryInitialFocus(view, tab)();
    expect(document.activeElement).toBe(activeTab);
});

it('review 4: redundant focusin on the starting tab does not cancel its initial content focus', () => {
    const { tab, activeTab, cards } = setup();
    activeTab.focus();
    const finish = createLibraryInitialFocus(view, tab);
    activeTab.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    finish();
    expect(document.activeElement).toBe(cards[0]);
});

it('SR5 count keeps the range on its own line inside the rail', () => {
    const { tab } = setup();
    bindLibraryPaging({ view: tab, query: { StartIndex: 0, Limit: 100 }, totalRecordCount: 255, isLoading: () => false, getRequestId: () => 1, refresh: vi.fn() });
    const count = tab.querySelector('.libraryRail .listPaging > span')!;
    expect(count.querySelector('br')).not.toBeNull();
    expect(count.querySelector('.libraryRailRange')?.textContent).toBe('1-100');
    expect(tab.querySelectorAll('.paging:not(.libraryRail .paging) .libraryRailRange')).toHaveLength(0);
});

it.each(['homeTab', 'genresTab'])('SR5 restores the exact element after Up leaves %s', tabId => {
    const { tab, cards, activeTab } = setup(false, 3);
    tab.id = tabId;
    cards[2].focus();
    key('up');
    // The normal spatial handler moves focus after the page command handler.
    activeTab.focus();
    key('down');
    expect(document.activeElement).toBe(cards[2]);
    cards[2].remove();
    activeTab.focus();
    expect(key('down')).toBe(false);
});

it('SR5 remembers a genre heading when spatial Up leaves it for the active tab', () => {
    const { tab, activeTab } = setup(false, 0);
    tab.innerHTML = '<a href="#" class="more">Action</a>';
    const heading = tab.querySelector<HTMLElement>('a')!;
    heading.focus();
    key('up');
    activeTab.focus();
    key('down');
    expect(document.activeElement).toBe(heading);
});

it('SR5 Genres Down goes directly to the next row and Up exposes that row title', () => {
    const { tab } = setup(false, 0);
    tab.id = 'genresTab';
    tab.innerHTML = [0, 1, 2].map(index => `<section class="verticalSection"><a href="#" class="more">Genre ${index}</a><div class="itemsContainer"><a href="#" class="card">${index}a</a><a href="#" class="card">${index}b</a></div></section>`).join('');
    const rows = tab.querySelectorAll('.itemsContainer');
    const headings = tab.querySelectorAll<HTMLElement>('.more');
    const second = rows[0].querySelectorAll<HTMLElement>('.card')[1];
    second.focus();
    key('down');
    expect(document.activeElement).toBe(rows[1].querySelectorAll('.card')[1]);
    key('up');
    expect(document.activeElement).toBe(headings[1]);
    key('down');
    expect(document.activeElement).toBe(rows[1].querySelector('.card'));
    key('down');
    expect(document.activeElement).toBe(rows[2].querySelector('.card'));
});

it.each(['empty', 'failed'])('R6 review skips an already %s genre row to later cards', state => {
    const { tab } = setup(false, 0);
    tab.id = 'genresTab';
    tab.innerHTML = '<section class="verticalSection"><a href="#" class="more">First</a><div class="itemsContainer"><a href="#" class="card">First card</a></div></section>'
        + `<section class="verticalSection"><a href="#" class="more">${state}</a><div class="itemsContainer"></div></section>`
        + '<section class="verticalSection"><a href="#" class="more">Last</a><div class="itemsContainer"><a href="#" class="card">Last card</a></div></section>';
    const cards = tab.querySelectorAll<HTMLElement>('.card');
    cards[0].focus();
    key('down');
    expect(document.activeElement).toBe(cards[1]);
});

it('R6 review uses the next row title when settled empty rows have no later cards', () => {
    const { tab } = setup(false, 0);
    tab.id = 'genresTab';
    tab.innerHTML = '<section class="verticalSection"><a href="#" class="more">First</a><div class="itemsContainer"><a href="#" class="card">First card</a></div></section>'
        + '<section class="verticalSection"><a href="#" class="more">Empty</a><div class="itemsContainer"></div></section>'
        + '<section class="verticalSection"><a href="#" class="more">Also empty</a><div class="itemsContainer"></div></section>';
    tab.querySelector<HTMLElement>('.card')!.focus();
    key('down');
    expect(document.activeElement).toBe(tab.querySelectorAll('.more')[1]);
});

it('R6 review focuses an empty genre container only while its load is pending', () => {
    const { tab } = setup(false, 0);
    tab.id = 'genresTab';
    tab.innerHTML = '<section class="verticalSection"><a href="#" class="more">First</a><div class="itemsContainer"><a href="#" class="card">First card</a></div></section>'
        + '<section class="verticalSection"><a href="#" class="more">Loading</a><div class="itemsContainer" data-loading="true"></div></section>';
    tab.querySelector<HTMLElement>('.card')!.focus();
    key('down');
    expect(document.activeElement).toBe(tab.querySelectorAll('.itemsContainer')[1]);
});
