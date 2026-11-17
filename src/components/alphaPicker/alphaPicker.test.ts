import { describe, expect, it, vi } from 'vitest';
import { AlphaPicker } from './alphaPicker';

vi.mock('../focusManager', () => ({ default: { focus: vi.fn(), autoFocus: vi.fn() } }));
vi.mock('../layoutManager', () => ({ default: { tv: true } }));
vi.mock('../../lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('../../elements/emby-button/paper-icon-button-light', () => ({}));
vi.mock('material-design-icons-iconfont', () => ({}));

function createPicker() {
    const element = document.createElement('div');
    const picker = new AlphaPicker({ element, valueChangeEvent: 'click' });
    const button = element.querySelector<HTMLButtonElement>('[data-value="A"]');
    if (!button) throw new Error('Missing letter button');
    return { element, picker, button };
}

describe('AlphaPicker click listener', () => {
    it('toggles the selected letter and dispatches changes', () => {
        const { element, picker, button } = createPicker();
        const changed = vi.fn();
        element.addEventListener('alphavaluechanged', changed);
        button.click();
        expect(picker.value()).toBe('A');
        button.click();
        expect(picker.value()).toBeNull();
        expect(changed).toHaveBeenCalledTimes(2);
        picker.destroy();
    });

    it('stops processing clicks while disabled', () => {
        const { element, picker, button } = createPicker();
        const changed = vi.fn();
        element.addEventListener('alphavaluechanged', changed);
        picker.enabled(false);
        button.click();
        expect(changed).not.toHaveBeenCalled();
        expect(picker.value()).toBeUndefined();
        picker.destroy();
    });

    it('registers only one handler across repeated enables', () => {
        const { element, picker, button } = createPicker();
        const changed = vi.fn();
        element.addEventListener('alphavaluechanged', changed);
        picker.enabled(false);
        picker.enabled(true);
        picker.enabled(true);
        button.click();
        expect(changed).toHaveBeenCalledTimes(1);
        expect(picker.value()).toBe('A');
        picker.destroy();
    });

    it('removes the registered handler on destroy', () => {
        const { element, picker, button } = createPicker();
        const add = vi.spyOn(element, 'addEventListener');
        const remove = vi.spyOn(element, 'removeEventListener');
        picker.enabled(false);
        picker.enabled(true);
        const handler = add.mock.calls.find(([name]) => name === 'click')?.[1];
        picker.destroy();
        expect(remove).toHaveBeenCalledWith('click', handler);
        const changed = vi.fn();
        element.addEventListener('alphavaluechanged', changed);
        button.click();
        expect(changed).not.toHaveBeenCalled();
    });

    it('keeps click handlers bound to their own picker', () => {
        const first = createPicker();
        const second = createPicker();
        first.button.click();
        expect(first.picker.value()).toBe('A');
        expect(second.picker.value()).toBeUndefined();
        first.picker.destroy();
        second.button.click();
        expect(second.picker.value()).toBe('A');
        second.picker.destroy();
    });
});
