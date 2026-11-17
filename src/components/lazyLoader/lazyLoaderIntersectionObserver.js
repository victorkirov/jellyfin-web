const sharedLoaders = new Map();
const activeLoaders = new Set();
let removalObserver;

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
    constructor(options) {
        this.options = options;
        this.elements = new Set();
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
                rootMargin: '50%',
                threshold: 0
            });

        this.observer = newObserver;
    }

    addElements(elements) {
        let observer = this.observer;

        if (!observer) {
            this.createObserver();
            observer = this.observer;
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
                this.observer.unobserve(element);
                this.elements.delete(element);
            }
        });
        if (!this.elements.size) {
            this.destroyObserver();
        }
    }

    destroyObserver() {
        const observer = this.observer;

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
        this.options = null;
    }
}

function unveilElements(elements, callback) {
    if (!elements.length) {
        return;
    }
    let lazyLoader = sharedLoaders.get(callback);
    if (!lazyLoader) {
        lazyLoader = new LazyLoader({ callback: callback });
        sharedLoaders.set(callback, lazyLoader);
    }
    lazyLoader.addElements(elements);
}

export function lazyChildren(elem, callback) {
    unveilElements(elem.getElementsByClassName('lazy'), callback);
}

export default {
    LazyLoader: LazyLoader,
    lazyChildren: lazyChildren
};
