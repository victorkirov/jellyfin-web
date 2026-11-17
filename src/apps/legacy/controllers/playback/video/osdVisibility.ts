/** Owns the display state of the header and playback controls. */
export function createOsdVisibility(header: HTMLElement, controls: HTMLElement) {
    function show(element: HTMLElement, hiddenClass: string) {
        element.classList.remove('hide');
        element.classList.remove(hiddenClass);
    }

    function hide(element: HTMLElement, hiddenClass: string) {
        element.classList.add(hiddenClass, 'hide');
    }

    return {
        showHeader: () => show(header, 'osdHeader-hidden'),
        hideHeader: () => hide(header, 'osdHeader-hidden'),
        showControls: () => show(controls, 'videoOsdBottom-hidden'),
        hideControls: () => hide(controls, 'videoOsdBottom-hidden'),
        restoreHeader: () => header.classList.remove('hide')
    };
}
