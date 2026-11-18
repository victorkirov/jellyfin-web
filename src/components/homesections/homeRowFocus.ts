import focusManager from 'lib/focusManager';
import inputManager from 'scripts/inputManager';

type RowFocus = { listener: EventListener; listening: boolean };
const rowFocus = new WeakMap<HTMLElement, RowFocus>();

function hasInternalRow(card: HTMLElement, row: HTMLElement, direction: number) {
    return Array.from(row.children).some(sibling => sibling instanceof HTMLElement && (sibling.offsetTop - card.offsetTop) * direction > 0);
}

export function resumeHomeRowFocus(container: HTMLElement) {
    let state = rowFocus.get(container);
    if (!state) {
        const remembered = new WeakMap<HTMLElement, HTMLElement>();
        const listener: EventListener = event => {
            const command = (event as CustomEvent<{ command: string }>).detail.command;
            const source = event.target;
            if (event.defaultPrevented || (command !== 'up' && command !== 'down') || !(source instanceof HTMLElement)) return;
            const row = source.closest<HTMLElement>('.itemsContainer');
            const card = source.closest<HTMLElement>('.card,.listItem,.homeLibraryButton');
            if (!row || !card || !container.contains(row)) return;
            remembered.set(row, source);
            const direction = command === 'up' ? -1 : 1;
            if (hasInternalRow(card, row, direction)) return;
            const rows = Array.from(container.querySelectorAll<HTMLElement>('.itemsContainer')).filter(element => element.offsetParent !== null);
            const nextRow = rows[rows.indexOf(row) + direction];
            const target = nextRow && remembered.get(nextRow);
            // A refreshed row falls back to the existing spatial navigation.
            if (!target || !nextRow.contains(target) || target.offsetParent === null) return;
            event.preventDefault();
            focusManager.focus(target);
        };
        state = { listener, listening: false };
        rowFocus.set(container, state);
    }
    if (!state.listening) {
        inputManager.on(container, state.listener);
        state.listening = true;
    }
}

export function pauseHomeRowFocus(container: HTMLElement) {
    const state = rowFocus.get(container);
    if (state?.listening) {
        inputManager.off(container, state.listener);
        state.listening = false;
    }
}

export function destroyHomeRowFocus(container: HTMLElement) {
    pauseHomeRowFocus(container);
    rowFocus.delete(container);
}
