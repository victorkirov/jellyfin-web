import { addEventListener, removeEventListener } from './domEvents';
import { getWindowSize, getScreenWidth } from './domWindow';

export { addEventListener, removeEventListener, getWindowSize, getScreenWidth };

/**
 * Useful DOM utilities.
 */

/**
 * Returns parent of element with specified attribute value.
 * @param {HTMLElement} elem - Element whose parent need to find.
 * @param {string} name - Attribute name.
 * @param {mixed} [value] - Attribute value.
 * @returns {HTMLElement} Parent with specified attribute value.
 */
export function parentWithAttribute(elem: HTMLElement, name: string, value?: string): HTMLElement | null {
    while ((value ? elem.getAttribute(name) !== value : !elem.getAttribute(name))) {
        // Document can be reached here; the next check only probes optional DOM properties.
        elem = elem.parentNode as HTMLElement;

        if (!elem?.getAttribute) {
            return null;
        }
    }

    return elem;
}

/**
 * Returns parent of element with one of specified tag names.
 * @param {HTMLElement} elem - Element whose parent need to find.
 * @param {(string|Array)} tagNames - Tag name or array of tag names.
 * @returns {HTMLElement} Parent with one of specified tag names.
 */
export function parentWithTag(elem: HTMLElement, tagNames: string | string[]): HTMLElement | null {
    // accept both string and array passed in
    if (!Array.isArray(tagNames)) {
        tagNames = [tagNames];
    }

    while (tagNames.indexOf(elem.tagName || '') === -1) {
        // Document can be reached here; the next check only probes optional DOM properties.
        elem = elem.parentNode as HTMLElement;

        if (!elem) {
            return null;
        }
    }

    return elem;
}

/**
 * Returns _true_ if class list contains one of specified names.
 * @param {DOMTokenList} classList - Class list.
 * @param {Array} classNames - Array of class names.
 * @returns {boolean} _true_ if class list contains one of specified names.
 */
function containsAnyClass(classList: DOMTokenList, classNames: string[]) {
    for (let i = 0, length = classNames.length; i < length; i++) {
        if (classList.contains(classNames[i])) {
            return true;
        }
    }
    return false;
}

/**
 * Returns parent of element with one of specified class names.
 * @param {HTMLElement} elem - Element whose parent need to find.
 * @param {(string|Array)} classNames - Class name or array of class names.
 * @returns {HTMLElement|null} Parent with one of specified class names.
 */
export function parentWithClass(elem: HTMLElement, classNames: string | string[]): HTMLElement | null {
    // accept both string and array passed in
    if (!Array.isArray(classNames)) {
        classNames = [classNames];
    }

    while (!elem.classList || !containsAnyClass(elem.classList, classNames)) {
        // Document can be reached here; the next check only probes optional DOM properties.
        elem = elem.parentNode as HTMLElement;

        if (!elem) {
            return null;
        }
    }

    return elem;
}

/**
 * Sets title and ARIA-label of element.
 * @param {HTMLElement} elem - Element to set the title and ARIA-label.
 * @param {string} title - Title.
 * @param {string?} [ariaLabel] - ARIA-label.
 */
export function setElementTitle(elem: Element, title: string, ariaLabel?: string) {
    elem.setAttribute('title', title);
    elem.setAttribute('aria-label', String(ariaLabel));
}

export default {
    parentWithAttribute,
    parentWithClass,
    parentWithTag,
    addEventListener,
    removeEventListener,
    getWindowSize,
    getScreenWidth,
    setElementTitle
};
