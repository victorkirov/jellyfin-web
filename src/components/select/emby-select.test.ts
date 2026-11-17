import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ show: vi.fn(), register: vi.fn() }));
vi.mock('webcomponents.js/webcomponents-lite', () => ({}));
vi.mock('../../lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('../../scripts/browser', () => ({ default: { web0s: true } }));
vi.mock('../actionSheet/actionSheet', () => ({ default: { show: mocks.show } }));

beforeEach(async () => {
    vi.resetModules();
    mocks.register.mockClear();
    mocks.show.mockResolvedValue('second');
    Object.assign(document, { registerElement: mocks.register });
    await import('./emby-select');
    document.body.innerHTML = '<label>Quality</label><select><option value="first">First</option><option value="second">Second</option></select>';
});
afterEach(() => {
    document.body.innerHTML = '';
});

describe('composed select registration', () => {
    it.each(['keydown', 'mousedown'])('opens its dialog with %s and emits change after selection', async eventType => {
        expect(mocks.register).toHaveBeenCalledWith('emby-select', expect.objectContaining({ extends: 'select' }));
        const select = document.querySelector('select')!;
        const prototype = mocks.register.mock.calls[0][1].prototype;
        prototype.createdCallback.call(select);
        const changed = vi.fn();
        select.addEventListener('change', changed);
        const event = eventType === 'keydown' ?
            new KeyboardEvent('keydown', { keyCode: 13, cancelable: true }) :
            new MouseEvent('mousedown', { button: 0, cancelable: true });
        select.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(mocks.show).toHaveBeenCalledWith({ items: select.options, positionTo: select, title: 'Quality' });
        await Promise.resolve();
        expect(select.value).toBe('second');
        expect(changed).toHaveBeenCalledOnce();
        expect(select.classList.contains('emby-select-focusscale')).toBe(true);
    });
});
