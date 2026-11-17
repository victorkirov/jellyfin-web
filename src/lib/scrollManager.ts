/**
 * Module for controlling scroll behavior.
 * @module lib/scrollManager
 */

import dom from '../utils/dom';
import DocumentScroller from './DocumentScroller';

type Scroller = Pick<HTMLElement, 'scrollLeft' | 'scrollTop' | 'scrollWidth' | 'scrollHeight' | 'clientWidth' | 'clientHeight' | 'getAttribute'> & {
    getBoundingClientRect(): Rect;
    scrollTo?: { (options: ScrollToOptions): void; (x: number, y: number): void };
};
type Rect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
type ScrollerData = { scrollPos: number; scrollSize: number; clientSize: number; mode: string | null; custom: boolean };
type StylesCache = WeakMap<Element, CSSStyleDeclaration>;
import layoutManager from './layoutManager';

// FIXME: Need to scroll to top of page to fully show the top menu. This can be solved by some marker of top most elements or their containers
/**
     * Returns minimum vertical scroll.
     * Scroll less than that value will be zeroed.
     *
     * @return {number} Minimum vertical scroll.
     */
function minimumScrollY() {
    const topMenu = document.querySelector('.headerTop');
    if (topMenu) {
        return topMenu.clientHeight;
    }
    return 0;
}

let supportsScrollToOptions = false;
try {
    const elem = document.createElement('div');

    const opts = Object.defineProperty({}, 'behavior', {
        get: function () {
            supportsScrollToOptions = true;
            return 'auto';
        }
    });

    elem.scrollTo(opts);
} catch {
    // no scroll to options support
}

/**
     * Returns value clamped by range [min, max].
     *
     * @param {number} value - Clamped value.
     * @param {number} min - Begining of range.
     * @param {number} max - Ending of range.
     * @return {number} Clamped value.
     */
function clamp(value: number, min: number, max: number) {
    if (value <= min) {
        return min;
    } else if (value >= max) {
        return max;
    }
    return value;
}

/**
     * Returns the required delta to fit range 1 into range 2.
     * In case of range 1 is bigger than range 2 returns delta to fit most out of range part.
     *
     * @param {number} begin1 - Begining of range 1.
     * @param {number} end1 - Ending of range 1.
     * @param {number} begin2 - Begining of range 2.
     * @param {number} end2 - Ending of range 2.
     * @return {number} Delta: <0 move range1 to the left, >0 - to the right.
     */
function fitRange(begin1: number, end1: number, begin2: number, end2: number) {
    const delta1 = begin1 - begin2;
    const delta2 = end2 - end1;
    if (delta1 < 0 && delta1 < delta2) {
        return -delta1;
    } else if (delta2 < 0) {
        return delta2;
    }
    return 0;
}

/**
     * @typedef {Object} Rect
     * @property {number} left - X coordinate of top-left corner.
     * @property {number} top - Y coordinate of top-left corner.
     * @property {number} width - Width.
     * @property {number} height - Height.
     */

/**
     * Document scroll wrapper helps to unify scrolling and fix issues of some browsers.
     *
     * webOS 2 Browser: scrolls documentElement (and window), but body has a scroll size
     *
     * webOS 3 Browser: scrolls body (and window)
     *
     * webOS 4 Native: scrolls body (and window); has a document.scrollingElement
     *
     * Tizen 4 Browser/Native: scrolls body (and window); has a document.scrollingElement
     *
     * Tizen 5 Browser/Native: scrolls documentElement (and window); has a document.scrollingElement
     */

/**
     * Default (document) scroller.
     */
const documentScroller = new DocumentScroller();

const scrollerHints = {
    x: {
        nameScroll: 'scrollWidth',
        nameClient: 'clientWidth',
        nameStyle: 'overflowX',
        nameScrollMode: 'data-scroll-mode-x'
    },
    y: {
        nameScroll: 'scrollHeight',
        nameClient: 'clientHeight',
        nameStyle: 'overflowY',
        nameScrollMode: 'data-scroll-mode-y'
    }
} as const;

function getStyles(element: Element, stylesCache: StylesCache) {
    let styles = stylesCache.get(element);
    if (!styles) {
        styles = window.getComputedStyle(element);
        stylesCache.set(element, styles);
    }
    return styles;
}

/**
     * Returns parent element that can be scrolled. If no such, returns document scroller.
     *
     * @param {HTMLElement} element - Element for which parent is being searched.
     * @param {boolean} vertical - Search for vertical scrollable parent.
     * @param {HTMLElement|DocumentScroller} Parent element that can be scrolled or document scroller.
     */
function isScrollableOverflow(overflow: string, scrollSize: number, clientSize: number) {
    return overflow === 'scroll' || overflow === 'auto' && scrollSize > clientSize;
}

function getScrollableParent(element: HTMLElement | null, vertical: boolean, stylesCache: StylesCache = new WeakMap()): Scroller {
    if (element) {
        const scrollerHint = vertical ? scrollerHints.y : scrollerHints.x;

        let parent = element.parentElement;

        while (parent && parent !== document.body) {
            const scrollMode = parent.getAttribute(scrollerHint.nameScrollMode);

            // Stop on self-scrolled containers
            if (scrollMode === 'custom') {
                return parent;
            }

            const styles = getStyles(parent, stylesCache);

            // Stop on fixed parent
            if (styles.position === 'fixed') {
                return parent;
            }

            const overflow = styles[scrollerHint.nameStyle];

            if (isScrollableOverflow(overflow, parent[scrollerHint.nameScroll], parent[scrollerHint.nameClient])) {
                return parent;
            }

            parent = parent.parentElement;
        }
    }

    return documentScroller;
}

/**
     * @typedef {Object} ScrollerData
     * @property {number} scrollPos - Current scroll position.
     * @property {number} scrollSize - Scroll size.
     * @property {number} clientSize - Client size.
     * @property {string} mode - Scrolling mode.
     * @property {boolean} custom - Custom scrolling mode.
     */

/**
     * Returns scroller data for specified orientation.
     *
     * @param {HTMLElement} scroller - Scroller.
     * @param {boolean} vertical - Vertical scroller data.
     * @return {ScrollerData} Scroller data.
     */
function getScrollerData(scroller: Scroller, vertical: boolean) {
    const data: ScrollerData = { scrollPos: 0, scrollSize: 0, clientSize: 0, mode: null, custom: false };

    if (!vertical) {
        data.scrollPos = scroller.scrollLeft;
        data.scrollSize = scroller.scrollWidth;
        data.clientSize = scroller.clientWidth;
        data.mode = scroller.getAttribute(scrollerHints.x.nameScrollMode);
    } else {
        data.scrollPos = scroller.scrollTop;
        data.scrollSize = scroller.scrollHeight;
        data.clientSize = scroller.clientHeight;
        data.mode = scroller.getAttribute(scrollerHints.y.nameScrollMode);
    }

    data.custom = data.mode === 'custom';

    return data;
}

/**
     * Returns position of child of scroller for specified orientation.
     *
     * @param {HTMLElement} scroller - Scroller.
     * @param {Rect} elementRect - Child bounding rectangle.
     * @param {Rect} scrollerRect - Scroller bounding rectangle.
     * @param {boolean} vertical - Vertical scroll.
     * @return {number} Child position.
     */
function getScrollerChildPos(scroller: Scroller, elementRect: Rect, scrollerRect: Rect, vertical: boolean) {
    if (!vertical) {
        return scroller.scrollLeft + elementRect.left - scrollerRect.left;
    } else {
        return scroller.scrollTop + elementRect.top - scrollerRect.top;
    }
}

/**
     * Returns scroll position for element.
     *
     * @param {ScrollerData} scrollerData - Scroller data.
     * @param {number} elementPos - Child element position.
     * @param {number} elementSize - Child element size.
     * @param {boolean} centered - Scroll to center.
     * @return {number} Scroll position.
     */
function calcScroll(scrollerData: ScrollerData, elementPos: number, elementSize: number, centered: boolean) {
    const maxScroll = scrollerData.scrollSize - scrollerData.clientSize;

    let scroll;

    if (centered) {
        scroll = elementPos + (elementSize - scrollerData.clientSize) / 2;
    } else {
        const delta = fitRange(elementPos, elementPos + elementSize - 1, scrollerData.scrollPos, scrollerData.scrollPos + scrollerData.clientSize - 1);
        scroll = scrollerData.scrollPos - delta;
    }

    return clamp(Math.round(scroll), 0, maxScroll);
}

/**
     * Calls scrollTo function in proper way.
     *
     * @param {HTMLElement} scroller - Scroller.
     * @param {ScrollToOptions} options - Scroll options.
     */
function scrollToHelper(scroller: Scroller, options: ScrollToOptions) {
    if (scroller.scrollTo) {
        if (!supportsScrollToOptions) {
            const scrollX = (options.left !== undefined ? options.left : scroller.scrollLeft);
            const scrollY = (options.top !== undefined ? options.top : scroller.scrollTop);
            scroller.scrollTo(scrollX, scrollY);
        } else {
            scroller.scrollTo(options);
        }
    } else if ('scrollLeft' in scroller) {
        if (options.left !== undefined) {
            scroller.scrollLeft = options.left;
        }
        if (options.top !== undefined) {
            scroller.scrollTop = options.top;
        }
    }
}

/**
     * Performs built-in scroll.
     *
     * @param {HTMLElement} xScroller - Horizontal scroller.
     * @param {number} scrollX - Horizontal coordinate.
     * @param {HTMLElement} yScroller - Vertical scroller.
     * @param {number} scrollY - Vertical coordinate.
     */
function builtinScroll(xScroller: Scroller | null, scrollX: number, yScroller: Scroller | null, scrollY: number) {
    const scrollBehavior = 'instant';

    if (xScroller !== yScroller) {
        if (xScroller) {
            scrollToHelper(xScroller, { left: scrollX, behavior: scrollBehavior });
        }
        if (yScroller) {
            scrollToHelper(yScroller, { top: scrollY, behavior: scrollBehavior });
        }
    } else if (xScroller) {
        scrollToHelper(xScroller, { left: scrollX, top: scrollY, behavior: scrollBehavior });
    }
}

/**
     * Returns true if scroll manager is enabled.
     */
export function isEnabled() {
    return layoutManager.tv;
}

/**
     * Scrolls the document to a given position.
     *
     * @param {number} scrollX - Horizontal coordinate.
     * @param {number} scrollY - Vertical coordinate.
     */
export function scrollTo(scrollX: number, scrollY: number) {
    // Scroller is document itself by default
    const scroller = getScrollableParent(null, false);

    const xScrollerData = getScrollerData(scroller, false);
    const yScrollerData = getScrollerData(scroller, true);

    scrollX = clamp(Math.round(scrollX), 0, xScrollerData.scrollSize - xScrollerData.clientSize);
    scrollY = clamp(Math.round(scrollY), 0, yScrollerData.scrollSize - yScrollerData.clientSize);

    builtinScroll(scroller, scrollX, scroller, scrollY);
}

/**
     * Scrolls the document to a given element.
     *
     * @param {HTMLElement} element - Target element of scroll task.
     */
function adjustVerticalScroll(scrollY: number, isFixed: boolean, elementRect: DOMRect, yScroller: Scroller) {
    // HACK: Scroll to top for top menu because it is hidden
    // FIXME: Need a marker to scroll top/bottom
    if (isFixed && elementRect.bottom < 0) {
        scrollY = 0;
    }

    // HACK: Ensure we are at the top
    // FIXME: Need a marker to scroll top/bottom
    if (scrollY < minimumScrollY() && yScroller === documentScroller) {
        scrollY = 0;
    }
    return scrollY;
}

export function scrollToElement(element: HTMLElement) {
    // Overflow eligibility can change between focus events as content loads.
    const stylesCache = new WeakMap();
    let xScroller: Scroller | null = getScrollableParent(element, false, stylesCache);
    let yScroller: Scroller | null = getScrollableParent(element, true, stylesCache);

    const xScrollerData = getScrollerData(xScroller, false);
    const yScrollerData = getScrollerData(yScroller, true);

    // Exit, since we have no control over scrolling in this container
    if (xScroller === yScroller && (xScrollerData.custom || yScrollerData.custom)) {
        return;
    }

    // Exit, since we have no control over scrolling in these containers
    if (xScrollerData.custom && yScrollerData.custom) {
        return;
    }

    let scrollCenterX = true;
    let scrollCenterY = true;
    const offsetParent = element.offsetParent as HTMLElement | null;

    // In Firefox offsetParent.offsetParent is BODY
    const isFixed = offsetParent && (!offsetParent.offsetParent || getStyles(offsetParent, stylesCache).position === 'fixed');

    // Scroll fixed elements to nearest edge (or do not scroll at all)
    if (isFixed) {
        scrollCenterX = scrollCenterY = false;
    }

    const elementRect = element.getBoundingClientRect();
    const xScrollerRect = xScrollerData.custom ? null : xScroller.getBoundingClientRect();
    let yScrollerRect;
    if (!yScrollerData.custom) {
        yScrollerRect = xScrollerRect && xScroller === yScroller ? xScrollerRect : yScroller.getBoundingClientRect();
    }

    let scrollX = 0;
    let scrollY = 0;

    if (!xScrollerData.custom) {
        const xPos = getScrollerChildPos(xScroller, elementRect, xScrollerRect!, false);
        scrollX = calcScroll(xScrollerData, xPos, elementRect.width, scrollCenterX);
    } else {
        xScroller = null;
    }

    if (!yScrollerData.custom) {
        const yPos = getScrollerChildPos(yScroller, elementRect, yScrollerRect!, true);
        scrollY = calcScroll(yScrollerData, yPos, elementRect.height, scrollCenterY);

        scrollY = adjustVerticalScroll(scrollY, !!isFixed, elementRect, yScroller);
    } else {
        yScroller = null;
    }

    builtinScroll(xScroller, scrollX, yScroller, scrollY);
}

if (isEnabled()) {
    dom.addEventListener(window, 'focusin', function(e: FocusEvent) {
        setTimeout(function() {
            scrollToElement(e.target as HTMLElement);
        }, 0);
    }, { capture: true });
}

export default {
    isEnabled: isEnabled,
    scrollTo: scrollTo,
    scrollToElement: scrollToElement
};
