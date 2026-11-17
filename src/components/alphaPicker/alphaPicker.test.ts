import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlphaPicker } from './alphaPicker';

vi.mock('../../scripts/browser', () => ({ default: { tv: true } }));
vi.mock('../../scripts/inputManager', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('../loading/loading.ts', () => ({ hide: vi.fn() }));
vi.mock('lib/navigationHistory', async () => {
    const { createMemoryHistory } = await import('history');
    return { history: createMemoryHistory() };
});
vi.mock('../../elements/emby-button/emby-button', () => ({}));
vi.mock('../focusManager', () => ({ default: { focus: (element: HTMLElement) => element?.focus(), autoFocus: (element: HTMLElement) => (element.querySelector<HTMLElement>('[autofocus]') || element.querySelector<HTMLElement>('button'))?.focus(), pushScope: vi.fn(), popScope: vi.fn() } }));
vi.mock('../layoutManager', () => ({ default: { tv: true } }));
vi.mock('../../lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('../../elements/emby-button/paper-icon-button-light', () => ({}));
vi.mock('material-design-icons-iconfont', () => ({}));

afterEach(() => {
    document.body.innerHTML = '';
});

function createPicker() {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const picker = new AlphaPicker({ element, valueChangeEvent: 'click' });
    element.querySelector<HTMLButtonElement>('button')!.click();
    const button = document.querySelector<HTMLButtonElement>('.alphaPickerDialog [data-value="A"]');
    if (!button) throw new Error('Missing letter button');
    return { element, picker, button };
}

describe('Library jump dialog', () => {
    it('keeps all letters out of the page until the trigger opens the dialog', () => {
        const element = document.createElement('div');
        element.className = 'alphaPicker';
        const picker = new AlphaPicker({ element, valueChangeEvent: 'click' });
        expect(element.querySelector('.alphaPickerTrigger')?.textContent).toBe('JumpToLetter');
        expect(element.querySelector('[data-value]')).toBeNull();
        picker.destroy();
    });

    it('offers every letter and All, applies the library query event only on activation', async () => {
        const { element, picker } = createPicker();
        const changed = vi.fn();
        element.addEventListener('alphavaluechanged', changed);
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.alphaPickerDialog [data-value]'));
        expect(buttons.map(button => button.dataset.value)).toEqual(['', '#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']);
        buttons.forEach(button => {
            button.focus();
        });
        expect(changed).not.toHaveBeenCalled();
        for (const value of ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '']) {
            const button = document.querySelector<HTMLButtonElement>('.alphaPickerDialog [data-value="' + value + '"]')!;
            button.click();
            expect(changed.mock.lastCall?.[0].detail.value).toBe(value || null);
            expect(picker.value()).toBe(value || null);
            await new Promise(resolve => setTimeout(resolve, 0));
            element.querySelector<HTMLButtonElement>('button')!.click();
        }
        picker.destroy();
    });

    it('clears a repeated letter and isolates two library pickers', async () => {
        const first = createPicker();
        first.button.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        const second = createPicker();
        second.button.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        first.element.querySelector<HTMLButtonElement>('button')!.click();
        document.querySelector<HTMLButtonElement>('.alphaPickerDialog [data-value="A"]')!.click();
        expect(first.picker.value()).toBeNull();
        expect(second.picker.value()).toBe('A');
        first.picker.destroy();
        second.picker.destroy();
    });

    it('opens compactly and focuses the selected letter', () => {
        const element = document.createElement('div');
        document.body.appendChild(element);
        const picker = new AlphaPicker({ element, valueChangeEvent: 'click' });
        picker.value('Z');
        element.querySelector<HTMLButtonElement>('button')!.click();
        expect(document.querySelector('.alphaPickerDialog')?.classList.contains('dialog-fixedSize')).toBe(false);
        expect(document.activeElement?.getAttribute('data-value')).toBe('Z');
        picker.destroy();
    });

    it('hides the whole trigger row outside name sorting and reflects saved queries', () => {
        const { element, picker } = createPicker();
        picker.updateControls({ SortBy: 'DateCreated', NameStartsWith: 'Z' });
        expect(element.style.display).toBe('none');
        picker.updateControls({ SortBy: 'SortName', NameLessThan: 'A' });
        expect(element.style.display).toBe('');
        expect(element.querySelector('button')?.textContent).toBe('JumpToLetter: #');
        picker.destroy();
    });

    it('closes through Back and restores the trigger without changing the filter', async () => {
        const { element, picker } = createPicker();
        const { history } = await import('lib/navigationHistory');
        const changed = vi.fn();
        element.addEventListener('alphavaluechanged', changed);
        document.querySelector<HTMLButtonElement>('[data-value="Z"]')!.focus();
        history.back();
        expect(document.querySelector('.alphaPickerDialog')).toBeNull();
        expect(document.activeElement).toBe(element.querySelector('button'));
        expect(changed).not.toHaveBeenCalled();
        picker.destroy();
    });

    it('disables and removes its trigger handler and closes on destroy', () => {
        const { element, picker } = createPicker();
        picker.enabled(false);
        expect(document.querySelector('.alphaPickerDialog')).toBeNull();
        element.querySelector<HTMLButtonElement>('button')!.click();
        expect(document.querySelector('.alphaPickerDialog')).toBeNull();
        picker.enabled(true);
        picker.enabled(true);
        element.querySelector<HTMLButtonElement>('button')!.click();
        expect(document.querySelectorAll('.alphaPickerDialog')).toHaveLength(1);
        picker.destroy();
        expect(document.querySelector('.alphaPickerDialog')).toBeNull();
    });

    it('keeps the search keyboard actions inline', () => {
        const element = document.createElement('div');
        const picker = new AlphaPicker({ element, mode: 'keyboard', valueChangeEvent: 'click' });
        const clicked = vi.fn();
        element.addEventListener('alphavalueclicked', clicked);
        element.querySelector<HTMLButtonElement>('[data-value="backspace"]')!.click();
        expect(clicked.mock.lastCall?.[0].detail.value).toBe('backspace');
        expect(element.querySelector('.alphaPickerTrigger')).toBeNull();
        picker.destroy();
    });
});
