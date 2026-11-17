import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCards, getCardsHtml } from '../cardbuilder/cardBuilder';
import type { CardItem } from '../cardbuilder/cardTypes';

const { registerElement } = vi.hoisted(() => ({ registerElement: vi.fn() }));
vi.mock('./blurhash.worker', () => ({ default: class { addEventListener() { /* No blurhash requested. */ } } }));
vi.mock('scripts/settings/userSettings', () => ({ enableBlurhash: () => false, enableFastFadein: () => true, enableImageTypes: () => true }));
vi.mock('scripts/browser', () => ({ default: {} }));
vi.mock('scripts/datetime', () => ({ default: {} }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: () => ({ serverId: () => 'server', getScaledImageUrl: (_id: string, options: { tag: string }) => options.tag }), getApi: () => ({ basePath: 'http://images.test' }) } }));
vi.mock('lib/focusManager', () => ({ default: { focus: vi.fn(), autoFocus: vi.fn() } }));
vi.mock('../indicators/indicators', () => ({ default: { getProgressBarHtml: () => '' } }));
vi.mock('../itemHelper', () => ({ default: { getDisplayName: (item: { Name: string }) => item.Name } }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('../playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('../router/appRouter', () => ({ appRouter: {} }));
vi.mock('../shortcuts', () => ({ default: {} }));
vi.mock('scripts/inputManager', () => ({ default: {} }));
vi.mock('utils/dom', () => ({ default: {} }));
vi.mock('elements/emby-button/paper-icon-button-light', () => ({}));
vi.mock('webcomponents.js/webcomponents-lite', () => ({}));
vi.mock('sortablejs', () => ({ default: {} }));

const observers: { targets: Set<Element>;
    callback: IntersectionObserverCallback }[] = [];
let frames: FrameRequestCallback[];
let images: HTMLImageElement[];
let containerPrototype: object;
function frame() {
    frames.splice(0).forEach(callback => {
        callback(0);
    });
}
function load(target: Element) {
    observers[0].callback([{ target, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    images[images.length - 1].dispatchEvent(new Event('load'));
}
const item = (id: string): CardItem => ({ Id: id, ServerId: 'server', Name: id, Type: 'Movie', ImageTags: { Primary: id + '.jpg' } });
const options = { shape: 'portrait', width: 200, disableIndicators: true };

beforeEach(async () => {
    frames = [];
    images = [];
    observers.length = 0;

    vi.stubGlobal('IntersectionObserver', class {
        targets = new Set<Element>();
        constructor(callback: IntersectionObserverCallback) {
            observers.push({ targets: this.targets, callback });
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
            images.push(image);
            return image;
        }
    });
    Object.defineProperty(document, 'registerElement', { configurable: true, value: registerElement });
    await import('../itemscontainer/emby-itemscontainer');
    containerPrototype = registerElement.mock.calls[0]?.[1].prototype || containerPrototype;
    document.body.innerHTML = '<div class="itemsContainer"></div>';
});
afterEach(async () => {
    document.body.innerHTML = '';
    await Promise.resolve();
    vi.unstubAllGlobals();
});

describe('image loader callers', () => {
    it('reuses observers on cardBuilder refresh and drops queued posters from the old page', async () => {
        const container = document.body.firstElementChild as HTMLElement;
        buildCards([item('one')], { ...options, itemsContainer: container });
        const old = container.querySelector('.lazy')!;
        load(old);
        buildCards([item('one')], { ...options, itemsContainer: container });
        expect(container.querySelector('.lazy')).toBe(old);
        buildCards([item('two')], { ...options, itemsContainer: container });
        const current = container.querySelector('.lazy')!;
        load(current);
        await Promise.resolve();
        frame();
        expect(old.hasAttribute('data-src')).toBe(true);
        expect(current.hasAttribute('data-src')).toBe(false);
        expect(observers).toHaveLength(2);
        observers.forEach(observer => {
            expect(observer.targets.has(old)).toBe(false);
            expect(observer.targets.has(current)).toBe(true);
        });
    });
    it('observes new itemsContainer pages without refilling unchanged markup', async () => {
        const prototype = containerPrototype as typeof HTMLDivElement.prototype & { refreshItems: () => Promise<void> };
        const container = Object.assign(document.body.firstElementChild!, {
            fetchData: vi.fn().mockResolvedValue({ Items: [item('page-one')] }),
            getItemsHtml: (items: CardItem[]) => getCardsHtml(items, options)
        });
        Object.setPrototypeOf(container, prototype);
        await prototype.refreshItems.call(container);
        const old = container.querySelector('.lazy')!;
        load(old);
        frame();
        await prototype.refreshItems.call(container);
        expect(container.querySelector('.lazy')).toBe(old);
        container.fetchData.mockResolvedValue({ Items: [item('page-two')] });
        await prototype.refreshItems.call(container);
        const current = container.querySelector('.lazy')!;
        load(current);
        frame();
        expect(images).toHaveLength(2);
        expect(current.hasAttribute('data-src')).toBe(false);
        expect(observers).toHaveLength(2);
        expect(observers[0].targets.has(old)).toBe(false);
    });
});
