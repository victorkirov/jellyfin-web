import { afterEach, expect, it, vi } from 'vitest';
vi.mock('webcomponents.js/webcomponents-lite', () => ({}));
vi.mock('../../scripts/browser', () => ({ default: {} }));

type Checkbox = HTMLInputElement & { attachedCallback(): void; detachedCallback(): void };
afterEach(() => {
    document.body.innerHTML = '';
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
    checkbox.detachedCallback();
    checkbox.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13 }));
    expect(change).toHaveBeenCalledTimes(2);
});
