import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferSection } from './deferSection';

let intersect: (entries: Partial<IntersectionObserverEntry>[]) => void;
const disconnect = vi.fn();
const observe = vi.fn();
const autoFocus = vi.fn();
const getFocusableElements = vi.fn();
const focus = vi.fn();

vi.mock('components/focusManager', () => ({
    default: { autoFocus: (...args: unknown[]) => autoFocus(...args), getFocusableElements: (...args: unknown[]) => getFocusableElements(...args), focus: (...args: unknown[]) => focus(...args) }
}));

beforeEach(() => {
    getFocusableElements.mockReturnValue([]);
    vi.stubGlobal('IntersectionObserver', class {
        constructor(callback: typeof intersect) { intersect = callback; }
        observe = observe;
        disconnect = disconnect;
    });
    document.body.innerHTML = '<main><section class="hide"><h2 id="title">Latest media</h2></section></main>';
});

afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

describe('Deferred sections', () => {
    it('observes a visible placeholder and loads only once near the viewport', async () => {
        const section = document.querySelector('section')!;
        const load = vi.fn();
        const destroy = deferSection(section, load);
        const target = document.querySelector<HTMLElement>('.focusable')!;
        expect(target.classList.contains('hide')).toBe(false);
        expect(target.style.minHeight).toBe('15em');
        expect(document.querySelectorAll('#title')).toHaveLength(1);
        expect(observe).toHaveBeenCalledWith(target);
        intersect([{ isIntersecting: false }]);
        expect(load).not.toHaveBeenCalled();
        intersect([{ isIntersecting: true }, { isIntersecting: true }]);
        await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(target.isConnected).toBe(false));
        destroy();
    });

    it('loads on TV focus and keeps the placeholder until rendering completes', async () => {
        const section = document.querySelector('section')!;
        let finish: () => void = () => undefined;
        const load = vi.fn(() => new Promise<void>(resolve => {
            finish = resolve;
        }));
        const destroy = deferSection(section, load);
        const target = document.querySelector<HTMLElement>('.focusable')!;
        target.focus();
        await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
        expect(target.isConnected).toBe(true);
        finish();
        await vi.waitFor(() => expect(target.isConnected).toBe(false));
        expect(autoFocus).toHaveBeenCalledWith(section);
        destroy();
    });

    it('cancels observation and focus loading when a view is paused or destroyed', async () => {
        const section = document.querySelector('section')!;
        const load = vi.fn();
        const destroy = deferSection(section, load);
        const target = document.querySelector<HTMLElement>('.focusable')!;
        destroy();
        intersect([{ isIntersecting: true }]);
        target.dispatchEvent(new FocusEvent('focusin'));
        await Promise.resolve();
        expect(load).not.toHaveBeenCalled();
        expect(target.isConnected).toBe(false);
        expect(disconnect).toHaveBeenCalled();
    });

    it('does not start a queued request after destruction', async () => {
        const load = vi.fn();
        const destroy = deferSection(document.querySelector('section')!, load);
        intersect([{ isIntersecting: true }]);
        destroy();
        await Promise.resolve();
        expect(load).not.toHaveBeenCalled();
    });

    it('moves focus to the next row outside an empty latest-library group', async () => {
        document.body.innerHTML = '<main class="page"><div><section class="hide"><h2>Latest</h2></section></div><button>Next row</button></main>';
        const section = document.querySelector('section')!;
        const next = document.querySelector('button')!;
        focus.mockImplementation((element: HTMLElement) => element.focus());
        const destroy = deferSection(section, vi.fn());
        const placeholder = document.querySelector<HTMLElement>('.focusable')!;
        getFocusableElements.mockImplementation((scope?: HTMLElement) => (
            scope ? [placeholder] : [placeholder, next]
        ));
        placeholder.focus();
        await vi.waitFor(() => expect(placeholder.isConnected).toBe(false));
        expect(document.activeElement).toBe(next);
        expect(focus).toHaveBeenCalledWith(next);
        destroy();
    });
});
