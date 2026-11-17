import { addEventListener } from './domEvents';

/**
 * Cached window size.
 */
let windowSize: { innerWidth: number; innerHeight: number } | null;

/**
 * Flag of event listener bound.
 */
let windowSizeEventsBound = false;

/**
 * Resets cached window size.
 */
function clearWindowSize() {
    windowSize = null;
}

/**
 * @typedef {Object} windowSize
 * @property {number} innerHeight - window innerHeight.
 * @property {number} innerWidth - window innerWidth.
 */

/**
 * Returns window size.
 * @returns {windowSize} Window size.
 */
export function getWindowSize() {
    if (!windowSize) {
        const innerWidth = window.innerWidth;
        const innerHeight = window.innerHeight;

        // NOTE: webOS has a bug that reports window size as infinite on page load, so we use a fallback size of 4K
        if (!Number.isFinite(innerWidth) || !Number.isFinite(innerHeight)) {
            return {
                innerWidth: Number.isFinite(innerWidth) ? innerWidth : 3840,
                innerHeight: Number.isFinite(innerHeight) ? innerHeight : 2160
            };
        }

        windowSize = {
            innerWidth,
            innerHeight
        };

        if (!windowSizeEventsBound) {
            windowSizeEventsBound = true;
            addEventListener(window, 'orientationchange', clearWindowSize, { passive: true });
            addEventListener(window, 'resize', clearWindowSize, { passive: true });
        }
    }

    return windowSize;
}

/**
 * Standard screen widths.
 */
const standardWidths = [480, 720, 1280, 1440, 1920, 2560, 3840, 5120, 7680];

/**
 * Returns screen width.
 * @returns {number} Screen width.
 */
export function getScreenWidth() {
    let width = Number.isFinite(window.innerWidth) ? window.innerWidth : 3840;
    const height = Number.isFinite(window.innerHeight) ? window.innerHeight : 2160;

    if (height > width) {
        width = height * (16.0 / 9.0);
    }

    standardWidths.sort((a, b) => Math.abs(width - a) - Math.abs(width - b));

    return standardWidths[0];
}

