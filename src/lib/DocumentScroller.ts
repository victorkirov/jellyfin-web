export default class DocumentScroller {
    /**
         * Horizontal scroll position.
         * @type {number}
         */
    get scrollLeft() {
        return window.pageXOffset;
    }

    set scrollLeft(val) {
        window.scroll(val, window.pageYOffset);
    }

    /**
         * Vertical scroll position.
         * @type {number}
         */
    get scrollTop() {
        return window.pageYOffset;
    }

    set scrollTop(val) {
        window.scroll(window.pageXOffset, val);
    }

    /**
         * Horizontal scroll size (scroll width).
         * @type {number}
         */
    get scrollWidth() {
        return Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    }

    /**
         * Vertical scroll size (scroll height).
         * @type {number}
         */
    get scrollHeight() {
        return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    }

    /**
         * Horizontal client size (client width).
         * @type {number}
         */
    get clientWidth() {
        return Math.min(document.documentElement.clientWidth, document.body.clientWidth);
    }

    /**
         * Vertical client size (client height).
         * @type {number}
         */
    get clientHeight() {
        return Math.min(document.documentElement.clientHeight, document.body.clientHeight);
    }

    /**
         * Returns attribute value.
         * @param {string} attributeName - Attibute name.
         * @return {string} Attibute value.
         */
    getAttribute(attributeName: string) {
        return document.body.getAttribute(attributeName);
    }

    /**
         * Returns bounding client rect.
         * @return {Rect} Bounding client rect.
         */
    getBoundingClientRect() {
        // Make valid viewport coordinates: documentElement.getBoundingClientRect returns rect of entire document relative to viewport
        return {
            left: 0,
            top: 0,
            width: this.clientWidth,
            height: this.clientHeight
        };
    }

    /**
         * Scrolls window.
         * @param {...mixed} args See window.scrollTo.
         */
    scrollTo(options: ScrollToOptions): void;
    scrollTo(x: number, y: number): void;
    scrollTo(options: ScrollToOptions | number, y?: number) {
        if (typeof options === 'number') {
            window.scrollTo(options, y!);
        } else {
            window.scrollTo(options);
        }
    }
}

