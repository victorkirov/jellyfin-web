import focusManager from 'lib/focusManager';

/** One initial content focus decision; user navigation cancels pending row focus. */
export function createInitialContentFocus(view: HTMLElement, tab: HTMLElement) {
    const initialFocus = document.activeElement;
    let pending = true;
    function cancel() {
        pending = false;
        document.removeEventListener('focusin', onFocus);
        view.removeEventListener('viewbeforehide', cancel);
        view.removeEventListener('viewdestroy', cancel);
    }
    function onFocus(event: FocusEvent) {
        if (event.target !== initialFocus) cancel();
    }
    document.addEventListener('focusin', onFocus);
    view.addEventListener('viewbeforehide', cancel);
    view.addEventListener('viewdestroy', cancel);
    const finish = () => {
        const focus = pending && document.documentElement.contains(tab) && tab.offsetParent !== null;
        cancel();
        if (!focus || document.activeElement?.closest('.dialog.opened')) return;
        const cards = tab.querySelectorAll<HTMLElement>('.itemsContainer .card,.itemsContainer .listItem');
        const card = Array.from(cards).find(element => element.offsetParent !== null);
        const target = card?.matches('a,button,.focusable') ? card : card?.querySelector<HTMLElement>('a,button,.focusable');
        focusManager.focus(target || document.querySelector<HTMLElement>('.emby-tab-button-active'));
    };
    return Object.assign(finish, { cancel });
}
