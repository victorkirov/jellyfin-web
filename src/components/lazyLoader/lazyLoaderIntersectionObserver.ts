type Callback = (entry: IntersectionObserverEntry, observer: IntersectionObserver) => void;
type Options = { callback: Callback; viewportMargin?: number };

const sharedLoaders = new Map<Callback, LazyLoader>();
const activeLoaders = new Set<LazyLoader>();
let removalObserver: MutationObserver | null;

function watchRemovals() {
    if (!removalObserver) {
        removalObserver = new MutationObserver(records => {
            if (records.some(record => Array.from(record.removedNodes).some(node => node.nodeType === 1))) {
                activeLoaders.forEach(loader => {
                    loader.removeDetachedElements();
                });
            }
        });
        removalObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
}

export class LazyLoader {
    options: Options;
    elements: Set<Element>;
    observer: IntersectionObserver | null = null;

    constructor(options: Options) {
        this.options = options;
        this.elements = new Set<Element>();
    }

    createObserver() {
        const callback = this.options.callback;

        const newObserver = new IntersectionObserver(
            (entries, observer) => {
                entries.forEach(entry => {
                    if (document.documentElement.contains(entry.target)) {
                        callback(entry, observer);
                    }
                });
            },
            {
                // Percentage root margins use viewport width, including in the polyfill.
                rootMargin: this.options.viewportMargin === undefined ? '50%' : `${window.innerHeight * this.options.viewportMargin}px 0px`,
                threshold: 0
            });

        this.observer = newObserver;
        if (this.options.viewportMargin !== undefined) window.addEventListener('resize', this.resizeObserver);
    }

    private resizeObserver = () => {
        this.observer?.disconnect();
        this.createObserver();
        this.elements.forEach(element => {
            this.observer!.observe(element);
        });
    };

    addElements(elements: ArrayLike<Element>) {
        let observer = this.observer!;

        if (!observer) {
            this.createObserver();
            observer = this.observer!;
        }

        Array.from(elements).forEach(element => {
            this.elements.add(element);
            observer.observe(element);
        });
        activeLoaders.add(this);
        watchRemovals();
    }

    removeDetachedElements() {
        this.elements.forEach(element => {
            if (!document.documentElement.contains(element)) {
                this.observer!.unobserve(element);
                this.elements.delete(element);
            }
        });
        if (!this.elements.size) {
            this.destroyObserver();
        }
    }

    destroyObserver() {
        const observer = this.observer!;

        if (observer) {
            observer.disconnect();
            window.removeEventListener('resize', this.resizeObserver);
            this.observer = null;
            this.elements.clear();
            activeLoaders.delete(this);
            if (sharedLoaders.get(this.options.callback) === this) {
                sharedLoaders.delete(this.options.callback);
            }
            if (!activeLoaders.size && removalObserver) {
                removalObserver.disconnect();
                removalObserver = null;
            }
        }
    }

    destroy() {
        this.destroyObserver();
        this.options = null!;
    }
}

function unveilElements(elements: ArrayLike<Element>, callback: Callback, viewportMargin?: number) {
    if (!elements.length) {
        return;
    }
    let lazyLoader = sharedLoaders.get(callback);
    if (!lazyLoader) {
        lazyLoader = new LazyLoader({ callback, viewportMargin });
        sharedLoaders.set(callback, lazyLoader);
    }
    lazyLoader.addElements(elements);
}

export function lazyChildren(elem: Element, callback: Callback, viewportMargin?: number) {
    unveilElements(elem.getElementsByClassName('lazy'), callback, viewportMargin);
}

export default {
    LazyLoader: LazyLoader,
    lazyChildren: lazyChildren
};
