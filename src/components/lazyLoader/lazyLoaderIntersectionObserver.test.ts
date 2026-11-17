import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LazyLoader, lazyChildren } from './lazyLoaderIntersectionObserver';

const observedElements = new Set<Element>();
const observe = vi.fn((element: Element) => {
    observedElements.add(element);
});
const unobserve = vi.fn((element: Element) => {
    observedElements.delete(element);
});
const disconnect = vi.fn(() => {
    observedElements.clear();
});
const observerConstructor = vi.fn(function () {
    return { observe, unobserve, disconnect };
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IntersectionObserver', observerConstructor);
    document.body.innerHTML = '<div><div class="lazy"></div></div>';
});

afterEach(async () => {
    document.body.innerHTML = '';
    await Promise.resolve();
    vi.unstubAllGlobals();
});

describe('shared lazy observers', () => {
    it('shares one observer across repeated container refreshes', () => {
        const callback = vi.fn();
        lazyChildren(document.body, callback);
        lazyChildren(document.body, callback);
        expect(observerConstructor).toHaveBeenCalledTimes(1);
        expect(observedElements.size).toBe(1);
    });

    it('can observe a target again after a callback unobserves it', () => {
        const callback = vi.fn();
        const target = document.querySelector('.lazy')!;
        lazyChildren(document.body, callback);
        unobserve(target);
        expect(observedElements.size).toBe(0);
        lazyChildren(document.body, callback);
        expect(observedElements.has(target)).toBe(true);
        expect(observerConstructor).toHaveBeenCalledTimes(1);
    });

    it('keeps callbacks separate', () => {
        lazyChildren(document.body, vi.fn());
        lazyChildren(document.body, vi.fn());
        expect(observerConstructor).toHaveBeenCalledTimes(2);
    });

    it('unobserves detached off-screen targets', async () => {
        lazyChildren(document.body, vi.fn());
        const target = document.querySelector('.lazy');
        target?.remove();
        await Promise.resolve();
        expect(unobserve).toHaveBeenCalledWith(target);
    });

    it('ignores removed text nodes when an OSD label changes', async () => {
        const label = document.createElement('span');
        label.textContent = '00:01';
        document.body.appendChild(label);
        lazyChildren(document.body, vi.fn());
        const removeDetachedElements = vi.spyOn(LazyLoader.prototype, 'removeDetachedElements');
        label.textContent = '00:02';
        await Promise.resolve();
        expect(removeDetachedElements).not.toHaveBeenCalled();
    });

    it('keeps observing targets moved within the document', async () => {
        lazyChildren(document.body, vi.fn());
        const target = document.querySelector('.lazy')!;
        document.body.appendChild(target);
        await Promise.resolve();
        expect(unobserve).not.toHaveBeenCalled();
    });
});

describe('viewport height margins', () => {
    it('updates pixel margins and retains all targets after viewport resize', () => {
        const loader = new LazyLoader({ callback: vi.fn(), viewportMargin: 1.5 });
        const target = document.querySelector('.lazy')!;
        loader.addElements([target]);
        vi.stubGlobal('innerHeight', 1080);
        window.dispatchEvent(new Event('resize'));
        expect(observerConstructor).toHaveBeenLastCalledWith(expect.any(Function), { rootMargin: '1620px 0px', threshold: 0 });
        expect(observedElements.has(target)).toBe(true);
        loader.destroy();
        const calls = observerConstructor.mock.calls.length;
        window.dispatchEvent(new Event('resize'));
        expect(observerConstructor).toHaveBeenCalledTimes(calls);
    });
});
