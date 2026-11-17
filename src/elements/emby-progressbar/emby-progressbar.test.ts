import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let prototype: { attachedCallback: () => void, detachedCallback: () => void };

beforeAll(async () => {
    const registerElement = vi.fn();
    Object.defineProperty(document, 'registerElement', { configurable: true, value: registerElement });
    await import('./emby-progressbar');
    prototype = registerElement.mock.calls[0][1].prototype;
});

afterAll(() => {
    Reflect.deleteProperty(document, 'registerElement');
});

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
});

afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
});

describe('time progress in cached views', () => {
    it('skips hidden updates, refreshes on show, and cleans up on detach', () => {
        const view = document.createElement('div');
        view.className = 'mainAnimatedPage hide';
        const element = document.createElement('div');
        element.setAttribute('data-automode', 'time');
        element.setAttribute('data-starttime', '0');
        element.setAttribute('data-endtime', '240000');
        element.innerHTML = '<div class="itemProgressBarForeground" style="width:0%"></div>';
        view.appendChild(element);
        document.body.appendChild(view);
        const query = vi.spyOn(element, 'querySelector');
        prototype.attachedCallback.call(element);
        vi.advanceTimersByTime(60000);
        expect(query).not.toHaveBeenCalled();
        view.classList.remove('hide');
        view.dispatchEvent(new CustomEvent('viewshow'));
        expect(element.querySelector<HTMLElement>('.itemProgressBarForeground')?.style.width).toBe('25%');
        vi.advanceTimersByTime(60000);
        expect(element.querySelector<HTMLElement>('.itemProgressBarForeground')?.style.width).toBe('50%');
        prototype.detachedCallback.call(element);
        expect(vi.getTimerCount()).toBe(0);
        query.mockClear();
        view.dispatchEvent(new CustomEvent('viewshow'));
        expect(query).not.toHaveBeenCalled();
    });

    it('keeps only one timer after repeated attachment', () => {
        const element = document.createElement('div');
        element.setAttribute('data-automode', 'time');
        prototype.attachedCallback.call(element);
        prototype.attachedCallback.call(element);
        expect(vi.getTimerCount()).toBe(1);
        prototype.detachedCallback.call(element);
        expect(vi.getTimerCount()).toBe(0);
    });
});
