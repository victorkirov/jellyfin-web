import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../scripts/browser', () => ({ default: {} }));
vi.mock('../../utils/dom', () => ({ default: {
    parentWithClass: () => null,
    addEventListener: (element: EventTarget, event: string, handler: EventListener) => element.addEventListener(event, handler)
} }));
vi.mock('../../components/layoutManager', () => ({ default: {} }));
vi.mock('../../scripts/keyboardNavigation', () => ({ default: {} }));
vi.mock('../../lib/globalize', () => ({ default: { getIsElementRTL: () => false } }));
vi.mock('webcomponents.js/webcomponents-lite', () => ({}));
vi.mock('../emby-input/emby-input', () => ({}));

type Slider = HTMLInputElement & {
    getMarkerInfo: ReturnType<typeof vi.fn<() => { progress: number }[]>>;
};
type SliderPrototype = {
    attachedCallback: (this: Slider) => void;
    detachedCallback: (this: Slider) => void;
};

async function createSlider(polling = true, initiallyVisible = true) {
    vi.useFakeTimers();
    vi.resetModules();
    let prototype: SliderPrototype | undefined;
    Object.defineProperty(document, 'registerElement', {
        configurable: true,
        value: (_name: string, options: { prototype: SliderPrototype }) => {
            prototype = options.prototype;
        }
    });
    const getDescriptor = Object.getOwnPropertyDescriptor;
    const descriptorSpy = vi.spyOn(Object, 'getOwnPropertyDescriptor').mockImplementation((object, property) => {
        if (polling && object === HTMLInputElement.prototype && property === 'value') return undefined;
        return getDescriptor(object, property);
    });
    await import('./emby-slider');
    descriptorSpy.mockRestore();
    document.body.innerHTML = '<div><div class="sliderMarkerContainer"></div><input type="range" min="0" max="100" value="10"></div>';
    const range = document.querySelector('input') as Slider;
    let visible = initiallyVisible;
    Object.defineProperty(range, 'offsetWidth', { get: () => visible ? 100 : 0 });
    range.getMarkerInfo = vi.fn(() => [{ progress: 0.2 }, { progress: 0.8 }]);
    prototype!.attachedCallback.call(range);
    vi.advanceTimersByTime(20);
    return {
        range,
        prototype: prototype!,
        setVisible: (value: boolean) => {
            visible = value;
        }
    };
}

afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.innerHTML = '';
});

describe('Slider updates', () => {
    it('does not schedule frames for unchanged values or hidden polling ticks', async () => {
        const { range, setVisible } = await createSlider();
        const frame = vi.spyOn(window, 'requestAnimationFrame');
        vi.advanceTimersByTime(1000);
        expect(frame).not.toHaveBeenCalled();
        range.getMarkerInfo.mockClear();
        setVisible(false);
        range.value = '60';
        vi.advanceTimersByTime(1000);
        expect(frame).not.toHaveBeenCalled();
        expect(range.getMarkerInfo).not.toHaveBeenCalled();
        setVisible(true);
        vi.advanceTimersByTime(120);
        expect(frame).toHaveBeenCalledTimes(1);
        expect(document.querySelector<HTMLElement>('.mdl-slider-background-lower')?.style.width).toBe('60%');
    });

    it('updates changed marker info even when the value stays the same', async () => {
        const { range } = await createSlider();
        range.getMarkerInfo.mockReturnValue([{ progress: 0.5 }]);
        vi.advanceTimersByTime(120);
        expect(document.querySelectorAll('.sliderMarker')).toHaveLength(1);
    });

    it('reads marker geometry before writing marker styles', async () => {
        const { range } = await createSlider();
        const calls: string[] = [];
        const markers = Array.from(document.querySelectorAll<HTMLElement>('.sliderMarker'));
        const track = document.querySelector('.sliderBubbleTrack')!;
        vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ width: 100 } as DOMRect);
        for (const marker of markers) {
            vi.spyOn(marker, 'getBoundingClientRect').mockImplementation(() => {
                calls.push('read');
                return { width: 10 } as DOMRect;
            });
            vi.spyOn(marker.classList, 'toggle').mockImplementation(() => {
                calls.push('write');
                return true;
            });
        }
        range.value = '50';
        vi.advanceTimersByTime(120);
        expect(calls.slice(0, 2)).toEqual(['read', 'read']);
        expect(markers[0].style.left).toBe('calc(20% - 5px)');
    });

    it('retains valueset updates without a polling timer', async () => {
        const { range, prototype } = await createSlider(false);
        expect(vi.getTimerCount()).toBe(0);
        range.value = '75';
        range.dispatchEvent(new Event('valueset'));
        vi.advanceTimersByTime(20);
        expect(document.querySelector<HTMLElement>('.mdl-slider-background-lower')?.style.width).toBe('75%');
        prototype.detachedCallback.call(range);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('cancels a pending change when the value returns to the rendered value', async () => {
        const { range } = await createSlider(false);
        range.value = '50';
        range.dispatchEvent(new Event('valueset'));
        range.value = '10';
        range.dispatchEvent(new Event('valueset'));
        vi.advanceTimersByTime(20);
        expect(document.querySelector<HTMLElement>('.mdl-slider-background-lower')?.style.width).toBe('10%');
    });

    it('refreshes the native setter path after being hidden and after bounds change', async () => {
        const { range, setVisible } = await createSlider(false);
        setVisible(false);
        range.value = '60';
        range.dispatchEvent(new Event('valueset'));
        vi.advanceTimersByTime(20);
        setVisible(true);
        vi.advanceTimersByTime(20);
        expect(document.querySelector<HTMLElement>('.mdl-slider-background-lower')?.style.width).toBe('60%');
        range.max = '200';
        range.dispatchEvent(new Event('valueset'));
        vi.advanceTimersByTime(20);
        expect(document.querySelector<HTMLElement>('.mdl-slider-background-lower')?.style.width).toBe('30%');
    });

    it('renders the native setter path when attached inside a hidden container', async () => {
        const { setVisible } = await createSlider(false, false);
        setVisible(true);
        expect(document.querySelector<HTMLElement>('.mdl-slider-background-lower')?.style.width).toBe('10%');
    });

    it('clears polling and pending frames on detach', async () => {
        const { range, prototype } = await createSlider();
        range.value = '50';
        vi.advanceTimersByTime(80);
        prototype.detachedCallback.call(range);
        expect(vi.getTimerCount()).toBe(0);
    });
});
