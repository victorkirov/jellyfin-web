import focusManager from 'lib/focusManager';
import inputManager from 'scripts/inputManager';
import './libraryRail.scss';

const letterFocus = new WeakSet<HTMLElement>();
const pagingFocus = new WeakMap<HTMLElement, string>();

export function rememberLibraryPaging(view: HTMLElement, control: Element) {
    let selector = '';
    if (control.closest('.libraryRail')) selector = control.classList.contains('btnNextPage') ? '.btnNextPage' : '.btnPreviousPage';
    pagingFocus.set(view, selector);
}

export function forgetLibraryPaging(view: HTMLElement) {
    pagingFocus.delete(view);
}

export function isLibraryDialogFocused() {
    return Boolean(document.activeElement?.closest('.dialog.opened'));
}

export function focusLibraryRefresh(view: HTMLElement) {
    const letterChanged = letterFocus.delete(view);
    if (isLibraryDialogFocused()) return true;
    if (!letterChanged && !pagingFocus.has(view)) return false;
    focusLibraryContent(view);
    return true;
}

export function focusLibraryContent(view: HTMLElement) {
    if (isLibraryDialogFocused()) return;
    const railControl = pagingFocus.get(view);
    const rail = view.querySelector<HTMLElement>('.libraryRail');
    const target = railControl && rail?.querySelector<HTMLElement>(railControl + ':not(:disabled)');
    if (target) focusManager.focus(target);
    else if (!focusManager.autoFocus(view.querySelector('.itemsContainer') || view) && rail) focusManager.autoFocus(rail);
}

function cardTarget(card: HTMLElement) {
    return card.matches('a,button,.focusable') ? card : card.querySelector<HTMLElement>('a,button,.focusable');
}

function rowCards(container: HTMLElement) {
    return Array.from(container.children).filter((element): element is HTMLElement => element instanceof HTMLElement && (element.classList.contains('card') || element.classList.contains('listItem')));
}

/** Page-local arrow boundaries; no per-card listeners or observers. */
export function bindLibraryRail(view: HTMLElement) {
    const memories = new Map<HTMLElement, { card?: HTMLElement; firstRow?: HTMLElement }>();
    function memory(tab: HTMLElement) {
        let value = memories.get(tab);
        if (!value) {
            value = {};
            memories.set(tab, value);
        }
        return value;
    }
    function visibleButtons(rail: HTMLElement) {
        return Array.from(rail.querySelectorAll<HTMLButtonElement>('button')).filter(button => !button.disabled && button.offsetParent !== null);
    }
    function returnToGrid(tab: HTMLElement, remembered?: HTMLElement) {
        const container = tab.querySelector<HTMLElement>('.itemsContainer');
        if (remembered && container?.contains(remembered)) focusManager.focus(cardTarget(remembered));
        else focusLibraryContent(tab);
    }
    function tabDown(event: Event) {
        const tab = Array.from(view.querySelectorAll<HTMLElement>('.pageTabContent')).find(element => element.offsetParent !== null);
        if (!tab?.querySelector('.libraryRail')) return;
        event.preventDefault();
        returnToGrid(tab, memory(tab).firstRow);
    }
    const onCommand: EventListener = event => {
        const command = (event as CustomEvent<{ command: string }>).detail.command;
        const source = event.target;
        if (!(source instanceof HTMLElement)) return;
        let target: HTMLElement | null | undefined;
        if (source.classList.contains('emby-tab-button') && command === 'down') {
            return tabDown(event);
        }
        const tab = source.closest<HTMLElement>('.pageTabContent');
        if (!tab || !view.contains(tab)) return;
        const rail = tab.querySelector<HTMLElement>('.libraryRail');
        if (rail?.contains(source)) {
            if (command === 'right') {
                event.preventDefault();
                returnToGrid(tab, memory(tab).card);
                return;
            }
            target = railTarget(source, command, visibleButtons(rail));
        } else {
            target = gridBoundary(source, tab, command, rail, memory(tab));
        }
        if (target) {
            event.preventDefault();
            focusManager.focus(target);
        }
    };
    view.addEventListener('alphavaluechanged', event => {
        const tab = (event.target as HTMLElement).closest<HTMLElement>('.pageTabContent');
        if (tab?.querySelector('.libraryRail')) letterFocus.add(tab);
    }, true);
    view.addEventListener('alphavalueconfirmed', event => {
        const target = event.target as HTMLElement;
        const tab = target.closest<HTMLElement>('.pageTabContent');
        if (tab) focusLibraryContent(tab);
    });
    let listening = false;
    function setListening(enabled: boolean) {
        if (listening === enabled) return;
        listening = enabled;
        if (enabled) inputManager.on(window, onCommand);
        else inputManager.off(window, onCommand);
    }
    view.addEventListener('viewshow', () => setListening(true));
    view.addEventListener('viewbeforehide', () => {
        setListening(false);
        for (const tab of view.querySelectorAll<HTMLElement>('.pageTabContent')) {
            forgetLibraryPaging(tab);
            letterFocus.delete(tab);
        }
    });
    view.addEventListener('viewdestroy', () => setListening(false));
}

function gridBoundary(source: HTMLElement, tab: HTMLElement, command: string, rail: HTMLElement | null, memory: { card?: HTMLElement; firstRow?: HTMLElement }) {
    const container = source.closest<HTMLElement>('.itemsContainer');
    const card = source.closest<HTMLElement>('.card,.listItem');
    if (!container || !card) return bottomPagingBoundary(source, tab, command);
    // Dynamic Genres/Suggestions rows also stay within their horizontal container.
    if (!container.classList.contains('focuscontainer-x')) container.classList.add('focuscontainer-x');
    const previous = card.previousElementSibling as HTMLElement | null;
    const next = card.nextElementSibling as HTMLElement | null;
    const first = container.firstElementChild as HTMLElement | null;
    if (command === 'left' && (!previous || previous.offsetTop !== card.offsetTop)) {
        memory.card = card;
        return rail?.querySelector<HTMLElement>('.alphaPickerTrigger:not([disabled])')?.offsetParent ? rail.querySelector<HTMLElement>('.alphaPickerTrigger') : rail && Array.from(rail.querySelectorAll<HTMLButtonElement>('button')).find(button => !button.disabled && button.offsetParent !== null) || source;
    }
    if (command === 'right' && (!next || next.offsetTop !== card.offsetTop)) return source;
    if (rail && command === 'up' && first?.offsetTop === card.offsetTop) {
        memory.firstRow = card;
        return document.querySelector<HTMLElement>('.emby-tab-button-active');
    }
    if (rail && command === 'down') {
        const last = container.lastElementChild as HTMLElement | null;
        if (last?.offsetTop === card.offsetTop) {
            memory.card = card;
            const paging = Array.from(tab.querySelectorAll<HTMLElement>('.paging')).find(element => !rail.contains(element));
            return paging?.querySelector<HTMLElement>('.btnNextPage:not(:disabled)') || paging?.querySelector<HTMLElement>('.btnPreviousPage:not(:disabled)') || source;
        }
    }
    return null;
}

function bottomPagingBoundary(source: HTMLElement, tab: HTMLElement, command: string) {
    if (command !== 'up' || !source.closest('.paging')) return null;
    const container = tab.querySelector<HTMLElement>('.itemsContainer');
    if (!container) return null;
    const cards = rowCards(container);
    const last = cards[cards.length - 1];
    if (!last) return null;
    const row = cards.filter(card => card.offsetTop === last.offsetTop);
    const center = source.getBoundingClientRect().left;
    row.sort((left, right) => Math.abs(left.getBoundingClientRect().left - center) - Math.abs(right.getBoundingClientRect().left - center));
    return cardTarget(row[0]);
}

function railTarget(source: HTMLElement, command: string, buttons: HTMLButtonElement[]) {
    const index = buttons.indexOf(source as HTMLButtonElement);
    if (command === 'left') return source;
    if (command === 'up') return buttons[Math.max(0, index - 1)];
    if (command === 'down') return buttons[Math.min(buttons.length - 1, index + 1)];
    return null;
}
