import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { postMessage, enableBlurhash, enableFastFadein, observeChildren, workerMessage } = vi.hoisted(() => ({
    postMessage: vi.fn(),
    workerMessage: vi.fn(),
    enableBlurhash: vi.fn(() => true),
    enableFastFadein: vi.fn(() => false),
    observeChildren: vi.fn()
}));

vi.mock('./blurhash.worker.ts', () => ({
    default: class {
        addEventListener = workerMessage;
        postMessage = postMessage;
    }
}));
vi.mock('../../scripts/settings/userSettings', () => ({ enableBlurhash, enableFastFadein }));
vi.mock('../lazyLoader/lazyLoaderIntersectionObserver', () => ({ lazyChildren: observeChildren }));

let imageLoader: typeof import('./imageLoader');

function intersect(target: Element, isIntersecting = true) {
    imageLoader.fillImage({ target, isIntersecting });
}

beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    imageLoader = await import('./imageLoader');
    enableBlurhash.mockReturnValue(true);
    document.body.innerHTML = '<div class="lazy" data-src="image.jpg" data-blurhash="hash"></div>';
});

describe('visible blurhash images', () => {
    it('does no decode work until an image intersects', () => {
        imageLoader.lazyChildren(document.body);
        const target = document.body.firstElementChild!;
        intersect(target, false);
        expect(postMessage).not.toHaveBeenCalled();
        intersect(target);
        expect(postMessage).toHaveBeenCalledTimes(1);
    });

    it('posts one decode for a hash shared by visible images', () => {
        document.body.innerHTML += document.body.innerHTML;
        imageLoader.lazyChildren(document.body);
        for (const target of document.querySelectorAll('.lazy')) {
            intersect(target);
            intersect(target);
        }
        expect(postMessage).toHaveBeenCalledTimes(1);
    });

    it('does not retry non-blurhashable images', () => {
        const target = document.body.firstElementChild!;
        target.classList.add('non-blurhashable');
        imageLoader.lazyChildren(document.body);
        intersect(target);
        expect(postMessage).not.toHaveBeenCalled();
    });

    it('respects disabled blurhash', () => {
        enableBlurhash.mockReturnValue(false);
        imageLoader.lazyChildren(document.body);
        intersect(document.body.firstElementChild!);
        expect(postMessage).not.toHaveBeenCalled();
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

function replyWithBlurhash() {
    workerMessage.mock.calls[0][1]({
        data: { pixels: new Uint8ClampedArray(4), hsh: 'hash', width: 1, height: 1 }
    });
}

function mockCanvas() {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        createImageData: () => ({ data: new Uint8ClampedArray(4) }),
        putImageData: vi.fn()
    } as unknown as CanvasRenderingContext2D);
}

describe('late blurhash replies', () => {
    it.each(['lazy-image-fadein', 'lazy-image-fadein-fast'])('hides a late canvas after %s', fadeClass => {
        mockCanvas();
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => callback(0));
        imageLoader.lazyChildren(document.body);
        const target = document.body.firstElementChild!;
        intersect(target);
        target.removeAttribute('data-src');
        target.classList.add(fadeClass);
        replyWithBlurhash();
        expect(document.querySelector('canvas')?.classList.contains('lazy-hidden')).toBe(true);
    });

    it('checks image completion again in the canvas insertion frame', () => {
        mockCanvas();
        const requestFrame = vi.fn<(callback: FrameRequestCallback) => number>(() => 1);
        vi.stubGlobal('requestAnimationFrame', requestFrame);
        imageLoader.lazyChildren(document.body);
        const target = document.body.firstElementChild!;
        intersect(target);
        replyWithBlurhash();
        target.classList.add('lazy-image-fadein');
        requestFrame.mock.calls[0][0](0);
        expect(document.querySelector('canvas')?.classList.contains('lazy-hidden')).toBe(true);
    });
});
