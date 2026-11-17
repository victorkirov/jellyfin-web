import { afterEach, expect, it, vi } from 'vitest';
vi.mock('webcomponents.js/webcomponents-lite', () => ({}));
vi.mock('../../scripts/browser', () => ({ default: {} }));

type Radio = HTMLInputElement & { attachedCallback(): void };
afterEach(() => {
    document.body.innerHTML = '';
});

it('upgrades once and selects on Enter without submitting or repeating change', async () => {
    let prototype: object = {};
    Object.defineProperty(document, 'registerElement', { configurable: true, value: (_name: string, options: { prototype: object }) => {
        prototype = options.prototype;
    } });
    await import('./emby-radio');
    document.body.innerHTML = '<label><input type="radio"><span>Sort by name</span></label>';
    const radio = document.querySelector('input') as Radio;
    Object.setPrototypeOf(radio, prototype);
    radio.attachedCallback();
    radio.attachedCallback();
    radio.focus();
    expect(radio.parentElement!.classList.contains('input-focused')).toBe(true);
    expect(radio.checked).toBe(false);
    radio.blur();
    expect(radio.parentElement!.classList.contains('input-focused')).toBe(false);
    expect(document.querySelectorAll('.mdl-radio__circles')).toHaveLength(1);
    const change = vi.fn();
    radio.addEventListener('change', change);
    const enter = new KeyboardEvent('keydown', { keyCode: 13, cancelable: true });
    radio.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(radio.checked).toBe(true);
    radio.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13 }));
    expect(change).toHaveBeenCalledOnce();
});
