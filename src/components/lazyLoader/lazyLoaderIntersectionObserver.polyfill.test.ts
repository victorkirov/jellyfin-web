import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LazyLoader } from './lazyLoaderIntersectionObserver';

const require = createRequire(import.meta.url);
const loaders: LazyLoader[] = [];

afterEach(() => {
    loaders.splice(0).forEach(loader => {
        loader.destroy();
    });
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('TV polyfill margin equivalence', () => {
    it.each([1080, 720])('resolves vertical percentages against a %spx root height', height => {
        vi.useFakeTimers();
        vi.stubGlobal('IntersectionObserver', undefined);
        vi.stubGlobal('IntersectionObserverEntry', undefined);
        Reflect.deleteProperty(window, 'IntersectionObserver');
        Reflect.deleteProperty(window, 'IntersectionObserverEntry');
        delete require.cache[require.resolve('intersection-observer')];
        require('intersection-observer');
        vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(height);
        vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1920);
        const target = document.createElement('div');
        document.body.appendChild(target);
        vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 600, width: 400, height: 600, toJSON: () => ({}) });
        const bounds = new Map<string, DOMRectReadOnly | null>();
        const margins = ['150% 0px', `${height * 1.5}px 0px`, '300% 0px', `${height * 3}px 0px`];
        margins.forEach(rootMargin => {
            const loader = new LazyLoader({ callback: entry => {
                bounds.set(rootMargin, entry.rootBounds);
            }, rootMargin });
            loaders.push(loader);
            loader.addElements([target]);
        });
        vi.advanceTimersByTime(101);
        expect(bounds.size).toBe(4);
        expect(bounds.get('150% 0px')).toEqual(bounds.get(`${height * 1.5}px 0px`));
        expect(bounds.get('300% 0px')).toEqual(bounds.get(`${height * 3}px 0px`));
        expect(bounds.get('150% 0px')).toMatchObject({ top: -height * 1.5, bottom: height * 2.5, left: 0, right: 1920 });
        expect(bounds.get('300% 0px')).toMatchObject({ top: -height * 3, bottom: height * 4, left: 0, right: 1920 });
    });
});
