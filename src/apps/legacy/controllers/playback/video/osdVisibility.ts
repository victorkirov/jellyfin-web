import dom from 'utils/dom';

/** Owns the display state of the header and playback controls. */
export function createOsdVisibility(header: HTMLElement, controls: HTMLElement) {
    const transitionEndEventName = dom.whichTransitionEvent();

    function clearHideListener(element: HTMLElement) {
        element.removeEventListener(transitionEndEventName, onHideComplete);
    }

    function onHideComplete(event: Event) {
        const element = event.target as HTMLElement;
        if (element !== controls && element !== header) return;
        element.classList.add('hide');
        clearHideListener(element);
    }

    function show(element: HTMLElement, hiddenClass: string) {
        clearHideListener(element);
        element.classList.remove('hide');
        element.classList.remove(hiddenClass);
    }

    function hide(element: HTMLElement, hiddenClass: string) {
        clearHideListener(element);
        element.classList.add(hiddenClass);
        element.addEventListener(transitionEndEventName, onHideComplete);
    }

    return {
        showHeader: () => show(header, 'osdHeader-hidden'),
        hideHeader: () => hide(header, 'osdHeader-hidden'),
        showControls: () => show(controls, 'videoOsdBottom-hidden'),
        hideControls: () => hide(controls, 'videoOsdBottom-hidden'),
        restoreHeader() {
            clearHideListener(header);
            header.classList.remove('hide');
        }
    };
}
