import { afterEach, expect, it, vi } from 'vitest';
vi.mock('webcomponents.js/webcomponents-lite', () => ({}));
const { browser } = vi.hoisted(() => ({ browser: { web0s: false } }));
vi.mock('../../scripts/browser', () => ({ default: browser }));

type Checkbox = HTMLInputElement & { attachedCallback(): void; detachedCallback(): void };
afterEach(() => {
    document.body.innerHTML = '';
    browser.web0s = false;
    vi.clearAllTimers();
    vi.useRealTimers();
});

it('upgrades once and toggles on Enter with a bubbling change, then detaches', async () => {
    let prototype: object = {};
    Object.defineProperty(document, 'registerElement', { configurable: true, value: (_name: string, options: { prototype: object }) => {
        prototype = options.prototype;
    } });
    await import('./emby-checkbox');
    document.body.innerHTML = '<label><input type="checkbox"><span>Show titles</span></label>';
    const checkbox = document.querySelector('input') as Checkbox;
    Object.setPrototypeOf(checkbox, prototype);
    checkbox.attachedCallback();
    checkbox.attachedCallback();
    checkbox.focus();
    expect(checkbox.parentElement!.classList.contains('input-focused')).toBe(true);
    expect(checkbox.checked).toBe(false);
    checkbox.blur();
    expect(checkbox.parentElement!.classList.contains('input-focused')).toBe(false);
    expect(document.querySelectorAll('.checkboxOutline')).toHaveLength(1);
    const change = vi.fn();
    checkbox.parentElement!.addEventListener('change', change);
    const enter = new KeyboardEvent('keydown', { keyCode: 13, cancelable: true });
    checkbox.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(checkbox.checked).toBe(true);
    checkbox.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13 }));
    expect(checkbox.checked).toBe(false);
    expect(change).toHaveBeenCalledTimes(2);
    checkbox.focus();
    checkbox.detachedCallback();
    expect(checkbox.parentElement!.classList.contains('input-focused')).toBe(false);
    checkbox.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13 }));
    expect(change).toHaveBeenCalledTimes(2);
    checkbox.blur();
    checkbox.attachedCallback();
    checkbox.focus();
    expect(checkbox.parentElement!.classList.contains('input-focused')).toBe(true);
    checkbox.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13 }));
    expect(change).toHaveBeenCalledTimes(3);
});

it('repaints webOS checkbox changes and removes repaint listeners on detach', async () => {
    vi.useFakeTimers();
    browser.web0s = true;
    vi.resetModules();
    let prototype: object = {};
    Object.defineProperty(document, 'registerElement', { configurable: true, value: (_name: string, options: { prototype: object }) => {
        prototype = options.prototype;
    } });
    await import('./emby-checkbox');
    document.body.innerHTML = '<label><input type="checkbox"><span>Show titles</span></label>';
    const checkbox = document.querySelector('input') as Checkbox;
    const label = checkbox.parentElement!;
    Object.setPrototypeOf(checkbox, prototype);
    checkbox.attachedCallback();
    vi.advanceTimersByTime(520);
    checkbox.checked = true;
    for (const event of ['change', 'click', 'focus', 'blur']) {
        checkbox.dispatchEvent(new Event(event));
        expect(label.style.webkitAnimationName).toBe('repaintChrome');
        expect(label.style.webkitAnimationDuration).toBe('10ms');
        vi.advanceTimersByTime(20);
        expect(label.style.webkitAnimationName).toBe('');
    }
    checkbox.detachedCallback();
    for (const event of ['change', 'click', 'focus', 'blur']) {
        checkbox.dispatchEvent(new Event(event));
        expect(label.style.webkitAnimationName).toBe('');
    }
});
