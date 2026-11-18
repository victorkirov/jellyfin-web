import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import appSettings from '../scripts/settings/appSettings';
import { scrollToElement } from './scrollManager';

vi.mock('./layoutManager', () => ({ default: { tv: true } }));

beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
    vi.spyOn(window, 'scroll').mockImplementation(vi.fn());
    vi.spyOn(window, 'scrollTo').mockImplementation(vi.fn());
});

afterEach(() => {
    vi.useRealTimers();
});

function createScroller() {
    document.body.innerHTML = '<div style="overflow: scroll"><button>Target</button></div>';
    const scroller = document.querySelector('div')!;
    const target = document.querySelector('button')!;
    Object.defineProperties(scroller, {
        scrollWidth: { value: 1000 }, scrollHeight: { value: 1000, configurable: true },
        clientWidth: { value: 200 }, clientHeight: { value: 200 }
    });
    // jsdom does not expand the overflow shorthand into its axis properties.
    scroller.style.overflowX = scroller.style.overflowY = 'scroll';
    const targetRect = vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
        left: 300, top: 400, right: 320, bottom: 420,
        width: 20, height: 20, x: 300, y: 400, toJSON: () => ({})
    });
    const scrollerRect = vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, right: 200, bottom: 200,
        width: 200, height: 200, x: 0, y: 0, toJSON: () => ({})
    });
    return { scroller, target, targetRect, scrollerRect };
}

it('shares styles and rectangles between axes without changing scroll positions', () => {
    const { scroller, target, targetRect, scrollerRect } = createScroller();
    const styles = vi.spyOn(window, 'getComputedStyle');

    scrollToElement(target);

    expect(scroller.scrollLeft).toBe(210);
    expect(scroller.scrollTop).toBe(310);
    expect(styles).toHaveBeenCalledTimes(1);
    expect(targetRect).toHaveBeenCalledTimes(1);
    expect(scrollerRect).toHaveBeenCalledTimes(1);
});

it('resolves parents again when content starts overflowing or the target moves', () => {
    const { scroller, target } = createScroller();
    scroller.style.overflowX = scroller.style.overflowY = 'auto';
    Object.defineProperty(scroller, 'scrollHeight', { value: 100, configurable: true });
    scrollToElement(target);
    expect(scroller.scrollTop).toBe(0);

    Object.defineProperty(scroller, 'scrollHeight', { value: 1000 });
    scrollToElement(target);
    expect(scroller.scrollTop).toBe(310);

    document.body.appendChild(target);
    scroller.scrollTop = 0;
    scrollToElement(target);
    expect(scroller.scrollTop).toBe(0);
});

it('positions focused elements immediately without animation frames', () => {
    const { target, scroller } = createScroller();
    const frame = vi.spyOn(window, 'requestAnimationFrame');
    target.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    vi.runOnlyPendingTimers();
    expect(scroller.scrollLeft).toBe(210);
    expect(scroller.scrollTop).toBe(310);
    expect(frame).not.toHaveBeenCalled();
});

it('ignores saved smooth-scroll values', () => {
    const { target, scroller } = createScroller();
    localStorage.setItem('enableSmoothScroll', 'true');
    scrollToElement(target);
    expect(scroller.scrollLeft).toBe(210);
    expect(scroller.scrollTop).toBe(310);
    localStorage.removeItem('enableSmoothScroll');
});

it('removes the smooth-scroll settings API', () => {
    expect('enableSmoothScroll' in appSettings).toBe(false);
});

it('leaves a shared custom scroller untouched without measuring rectangles', () => {
    const { scroller, target, targetRect, scrollerRect } = createScroller();
    scroller.setAttribute('data-scroll-mode-x', 'custom');

    scrollToElement(target);

    expect(scroller.scrollLeft).toBe(0);
    expect(scroller.scrollTop).toBe(0);
    expect(targetRect).not.toHaveBeenCalled();
    expect(scrollerRect).not.toHaveBeenCalled();
});

it.each([0, 40, 180])('keeps vertical position for a fully visible target at %s', top => {
    const { scroller, target, targetRect } = createScroller();
    scroller.scrollTop = 300;
    targetRect.mockReturnValue({ left: 300, top, right: 320, bottom: top + 20, width: 20, height: 20 } as DOMRect);
    scrollToElement(target);
    expect(scroller.scrollTop).toBe(300);
    expect(scroller.scrollLeft).toBe(210);
});
it.each([-1, 181])('brings a partially clipped target at %s fully into view', top => {
    const { scroller, target, targetRect } = createScroller();
    scroller.scrollTop = 300;
    targetRect.mockReturnValue({ left: 300, top, right: 320, bottom: top + 20, width: 20, height: 20 } as DOMRect);
    scrollToElement(target);
    const nextTop = top - (scroller.scrollTop - 300);
    expect(nextTop).toBeGreaterThanOrEqual(0);
    expect(nextTop + 20).toBeLessThanOrEqual(200);
});
