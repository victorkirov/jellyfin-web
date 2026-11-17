import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ScrollerFactory from './index';

vi.mock('../../scripts/browser', () => ({ default: { web0s: true } }));
vi.mock('../layoutManager', () => ({ default: { tv: true } }));
vi.mock('../globalize', () => ({ default: { getIsRTL: () => false } }));
vi.mock('resize-observer-polyfill', () => ({
    default: class {
        observe() { /* No layout in jsdom. */ }
        disconnect() { /* No layout in jsdom. */ }
    }
}));

beforeEach(() => {
    document.body.innerHTML = '<div class="frame"><div><button>Focused item</button></div></div>';
});
afterEach(() => {
    document.body.innerHTML = '';
});

function createScroller() {
    const frame = document.querySelector<HTMLElement>('.frame')!;
    const slidee = frame.firstElementChild as HTMLElement;
    Object.defineProperties(slidee, {
        clientWidth: { value: 200 }, offsetWidth: { value: 1000 }, scrollWidth: { value: 1000 }
    });
    return { frame, scroller: new ScrollerFactory(frame, { horizontal: true, slidee }) };
}

it('keeps native TV scroller classes and positions items without scrollTo APIs', () => {
    const { frame, scroller } = createScroller();
    scroller.init();
    scroller.slideTo(125, true);
    expect(frame.classList.contains('smoothScrollX')).toBe(true);
    expect(frame.getAttribute('data-scroll-mode-x')).toBe('custom');
    expect(frame.scrollLeft).toBe(125);
    expect(scroller.getScrollPosition()).toBe(125);
    scroller.destroy();
    expect(frame.hasAttribute('data-scroll-mode-x')).toBe(false);
});

it('requests instant native scrolling even when the caller allows animation', () => {
    const { frame, scroller } = createScroller();
    const scroll = vi.fn();
    frame.scroll = scroll;
    scroller.init();
    scroller.slideTo(125, false);
    expect(scroll).toHaveBeenCalledWith({ left: 125, behavior: 'instant' });
    scroller.destroy();
});

it('positions an explicit transform scroller without transitions or layers', () => {
    const frame = document.querySelector<HTMLElement>('.frame')!;
    const slidee = frame.firstElementChild as HTMLElement;
    const scroller = new ScrollerFactory(frame, {
        horizontal: true, slidee, allowNativeScroll: false, dispatchScrollEvent: true
    });
    const onScroll = vi.fn();
    frame.addEventListener('scrollanimate', onScroll);
    scroller.init();
    scroller.slideTo(125);
    expect(slidee.style.transform).toBe('translateX(-125px)');
    expect(slidee.style.transition).toBe('');
    expect(slidee.style.willChange).toBe('');
    expect(onScroll).toHaveBeenCalledOnce();
    scroller.destroy();
});
