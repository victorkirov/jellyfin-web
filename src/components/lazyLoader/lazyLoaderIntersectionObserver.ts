type Callback = (entry: IntersectionObserverEntry, observer: IntersectionObserver) => void;
type Options = { callback: Callback; rootMargin?: string };

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
                rootMargin: this.options.rootMargin || '50%',
                threshold: 0
            });

        this.observer = newObserver;
    }

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

    removeElement(element: Element) {
        this.observer?.unobserve(element);
        this.elements.delete(element);
        if (!this.elements.size) this.destroyObserver();
    }

    removeDetachedElements() {
        this.elements.forEach(element => {
            if (!document.documentElement.contains(element)) {
                this.removeElement(element);
            }
        });
    }

    destroyObserver() {
        const observer = this.observer!;

        if (observer) {
            observer.disconnect();
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

function unveilElements(elements: ArrayLike<Element>, callback: Callback, rootMargin?: string) {
    if (!elements.length) {
        return;
    }
    let lazyLoader = sharedLoaders.get(callback);
    if (!lazyLoader) {
        lazyLoader = new LazyLoader({ callback, rootMargin });
        sharedLoaders.set(callback, lazyLoader);
    }
    lazyLoader.addElements(elements);
}

export function lazyChildren(elem: Element, callback: Callback, rootMargin?: string) {
    unveilElements(elem.getElementsByClassName('lazy'), callback, rootMargin);
}

export default {
    LazyLoader: LazyLoader,
    lazyChildren: lazyChildren
};
