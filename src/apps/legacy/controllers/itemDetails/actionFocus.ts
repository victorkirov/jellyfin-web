import focusManager from 'lib/focusManager';
import inputManager from 'scripts/inputManager';

/** Keep the primary action as the entry point when returning from lower content. */
export function bindActionFocus(view: HTMLElement) {
    const bar = view.querySelector<HTMLElement>('.mainDetailButtons')!;
    const onCommand = (event: Event) => {
        const command = (event as CustomEvent<{ command: string }>).detail.command;
        const source = event.target;
        if (event.defaultPrevented || command !== 'up' || !(source instanceof HTMLElement)
            || !source.closest('.detailPagePrimaryContent, .detailPageSecondaryContainer')) return;

        focusManager.moveUp(source);
        if (bar.contains(document.activeElement)) {
            const primary = bar.querySelector<HTMLElement>('.btnPlay:not(.hide)');
            if (primary) focusManager.focus(primary);
        }
        event.preventDefault();
    };
    inputManager.on(view, onCommand);
    return () => inputManager.off(view, onCommand);
}
