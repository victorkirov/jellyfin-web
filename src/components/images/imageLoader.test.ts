import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { postMessage, enableBlurhash, workerMessage } = vi.hoisted(() => ({
    postMessage: vi.fn(), workerMessage: vi.fn(), enableBlurhash: vi.fn(() => true)
}));
vi.mock('./blurhash.worker', () => ({ default: class {
    addEventListener = workerMessage;
    postMessage = postMessage;
} }));
vi.mock('../../scripts/settings/userSettings', () => ({ enableBlurhash }));

let imageLoader: typeof import('./imageLoader');
let observers: { callback: IntersectionObserverCallback;
    options: IntersectionObserverInit;
    targets: Set<Element> }[];
let frames: FrameRequestCallback[];
let preloaders: HTMLImageElement[];
function frame() {
    const callbacks = frames.splice(0);
    callbacks.forEach(callback => {
        callback(0);
    });
}
function targets() {
    return Array.from(document.querySelectorAll<HTMLElement>('.lazy'));
}
function intersect(target: Element, inside = true) {
    observers[0].callback([{ target, isIntersecting: inside } as IntersectionObserverEntry], {} as IntersectionObserver);
}
function complete() {
    preloaders.forEach(image => {
        image.dispatchEvent(new Event('load'));
    });
}

beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    observers = [];
    frames = [];
    preloaders = [];
    enableBlurhash.mockReturnValue(true);
    vi.stubGlobal('IntersectionObserver', class {
        targets = new Set<Element>();
        constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
            observers.push({ callback, options, targets: this.targets });
        }
        observe(target: Element) {
            this.targets.add(target);
        }
        unobserve(target: Element) {
            this.targets.delete(target);
        }
        disconnect() {
            this.targets.clear();
        }
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        frames.push(callback);
        return frames.length;
    });
    vi.stubGlobal('Image', class {
        constructor() {
            const image = document.createElement('img');
            preloaders.push(image);
            return image;
        }
    });
    imageLoader = await import('./imageLoader');
    document.body.innerHTML = '<div><div class="cardPadder"></div><div class="lazy" data-src="image.jpg" data-blurhash="hash"></div></div>';
});
afterEach(async () => {
    document.body.innerHTML = '';
    await Promise.resolve();
    vi.unstubAllGlobals();
});

describe('poster load scheduling', () => {
    it('applies a completed row one poster per animation frame', () => {
        document.body.innerHTML = document.body.innerHTML.repeat(4);
        imageLoader.lazyChildren(document.body);
        targets().forEach(target => {
            intersect(target);
        });
        complete();
        expect(frames).toHaveLength(1);
        for (let count = 1; count <= 4; count++) {
            frame();
            expect(targets().filter(target => !target.hasAttribute('data-src'))).toHaveLength(count);
        }
    });
    it('bounds stale inspections per frame and eventually applies attached posters in order', () => {
        document.body.innerHTML = document.body.innerHTML.repeat(130);
        imageLoader.lazyChildren(document.body);
        const posters = targets();
        posters.forEach(target => {
            intersect(target);
        });
        complete();
        posters.slice(0, 128).forEach(target => {
            target.remove();
        });
        const contains = vi.spyOn(document.documentElement, 'contains');
        frame();
        expect(contains.mock.calls.length).toBeGreaterThan(0);
        expect(contains.mock.calls.length).toBeLessThanOrEqual(32);
        expect(posters[128].hasAttribute('data-src')).toBe(true);
        for (let count = 0; frames.length && count < 10; count++) frame();
        expect(frames).toHaveLength(0);
        expect(posters.slice(0, 128).every(target => target.hasAttribute('data-src'))).toBe(true);
        expect(posters.slice(128).every(target => !target.hasAttribute('data-src'))).toBe(true);
    });
    it('bounds superseded queued entries before applying the replacement', () => {
        const [target] = targets();
        for (let index = 0; index < 130; index++) {
            imageLoader.setLazyImage(target, `poster-${index}.jpg`);
            preloaders[index].dispatchEvent(new Event('load'));
        }
        frame();
        expect(target.style.backgroundImage).toBe('');
        expect(frames).toHaveLength(1);
        for (let count = 0; frames.length && count < 10; count++) frame();
        expect(target.style.backgroundImage).toContain('poster-129.jpg');
        expect(frames).toHaveLength(0);
    });
    it('skips detached queued posters and still applies the next attached poster', () => {
        document.body.innerHTML += document.body.innerHTML;
        imageLoader.lazyChildren(document.body);
        const [first, second] = targets();
        targets().forEach(target => {
            intersect(target);
        });
        complete();
        first.remove();
        frame();
        expect(first.hasAttribute('data-src')).toBe(true);
        expect(second.hasAttribute('data-src')).toBe(false);
    });
    it('skips queued posters that left the load zone and retries on reentry', () => {
        imageLoader.lazyChildren(document.body);
        const [target] = targets();
        intersect(target);
        complete();
        intersect(target, false);
        frame();
        expect(target.hasAttribute('data-src')).toBe(true);
        intersect(target);
        complete();
        frame();
        expect(target.hasAttribute('data-src')).toBe(false);
    });
    it('does not duplicate a pending request on repeated observer delivery', () => {
        imageLoader.lazyChildren(document.body);
        intersect(targets()[0]);
        intersect(targets()[0]);
        expect(preloaders).toHaveLength(1);
    });
    it('ignores an old request after setLazyImage replaces its URL', () => {
        const [target] = targets();
        imageLoader.setLazyImage(target, 'old.jpg');
        imageLoader.setLazyImage(target, 'new.jpg');
        preloaders[1].dispatchEvent(new Event('load'));
        frame();
        preloaders[0].dispatchEvent(new Event('load'));
        frame();
        expect(target.style.backgroundImage).toContain('new.jpg');
    });
    it('fills standalone IMG elements without waiting for an observer', () => {
        const target = document.createElement('img');
        document.body.appendChild(target);
        imageLoader.setLazyImage(target, 'direct.jpg');
        complete();
        frame();
        expect(target.getAttribute('src')).toBe('direct.jpg');
    });
    it('preserves lazyImage with an explicit source and no data attribute', () => {
        const [target] = targets();
        target.removeAttribute('data-src');
        imageLoader.lazyImage(target, 'explicit.jpg');
        complete();
        frame();
        expect(target.style.backgroundImage).toContain('explicit.jpg');
    });
    it('does not reload an already-filled direct image when the load observer adopts it', () => {
        const [target] = targets();
        imageLoader.setLazyImage(target, 'direct.jpg');
        complete();
        frame();
        imageLoader.lazyChildren(document.body);
        intersect(target);
        expect(target.style.backgroundImage).toContain('direct.jpg');
        expect(preloaders).toHaveLength(1);
    });
    it('loads a replacement URL set after the poster was filled', () => {
        imageLoader.lazyChildren(document.body);
        const [target] = targets();
        intersect(target);
        complete();
        frame();
        imageLoader.setLazyImage(target, 'replacement.jpg');
        intersect(target, false);
        intersect(target);
        complete();
        frame();
        expect(target.style.backgroundImage).toContain('replacement.jpg');
        expect(preloaders).toHaveLength(2);
    });
    it('retries an image after a failed preload', () => {
        imageLoader.lazyChildren(document.body);
        intersect(targets()[0]);
        preloaders[0].dispatchEvent(new Event('error'));
        intersect(targets()[0]);
        complete();
        frame();
        expect(targets()[0].hasAttribute('data-src')).toBe(false);
    });
});

describe('TV observer zones and presentation', () => {
    it('loads 1.5 viewport heights ahead with a single observer', () => {
        imageLoader.lazyChildren(document.body);
        intersect(targets()[0]);
        complete();
        frame();
        expect(observers.map(observer => observer.options.rootMargin)).toEqual(['150% 0px']);
    });
    it('keeps filled posters after they scroll far away so scrolling back does not reload them', () => {
        imageLoader.lazyChildren(document.body);
        const [target] = targets();
        intersect(target);
        complete();
        frame();
        intersect(target, false);
        expect(target.hasAttribute('data-src')).toBe(false);
        expect(target.style.backgroundImage).toContain('image.jpg');
        intersect(target);
        expect(preloaders).toHaveLength(1);
        expect(observers).toHaveLength(1);
    });
    it('applies posters immediately without fade classes or animation listeners', () => {
        imageLoader.lazyChildren(document.body);
        const [target] = targets();
        const listener = vi.spyOn(target, 'addEventListener');
        intersect(target);
        complete();
        frame();
        expect(target.className).not.toMatch(/lazy-image-fadein|lazy-hidden/);
        expect(listener).not.toHaveBeenCalledWith('animationend', expect.anything());
        expect(document.querySelector('.cardPadder')?.classList.contains('lazy-hidden-children')).toBe(true);
    });
});

describe('optional blurhash', () => {
    it('decodes only when intersecting and shares a hash across posters', () => {
        document.body.innerHTML += document.body.innerHTML;
        imageLoader.lazyChildren(document.body);
        targets().forEach(target => {
            intersect(target, false);
        });
        expect(postMessage).not.toHaveBeenCalled();
        targets().forEach(target => {
            intersect(target);
            intersect(target);
        });
        expect(postMessage).toHaveBeenCalledTimes(1);
    });
    it('respects disabled blurhash', () => {
        enableBlurhash.mockReturnValue(false);
        imageLoader.lazyChildren(document.body);
        intersect(targets()[0]);
        expect(postMessage).not.toHaveBeenCalled();
    });
    it('does not retry non-blurhashable images', () => {
        targets()[0].classList.add('non-blurhashable');
        imageLoader.lazyChildren(document.body);
        intersect(targets()[0]);
        expect(postMessage).not.toHaveBeenCalled();
    });
    it.each([true, false])('hides a canvas with completion first=%s and keeps it hidden after scrolling away', completionFirst => {
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ createImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData: vi.fn() } as unknown as CanvasRenderingContext2D);
        imageLoader.lazyChildren(document.body);
        intersect(targets()[0]);
        if (completionFirst) {
            complete();
            frame();
        }
        workerMessage.mock.calls[0][1]({ data: { pixels: new Uint8ClampedArray(4), hsh: 'hash', width: 1, height: 1 } });
        if (!completionFirst) complete();
        frame();
        frame();
        expect(document.querySelector('canvas')?.classList.contains('lazy-hidden')).toBe(true);
        intersect(targets()[0], false);
        expect(document.querySelector('canvas')?.classList.contains('lazy-hidden')).toBe(true);
    });
});
