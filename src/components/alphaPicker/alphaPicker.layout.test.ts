import { afterEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'sass';
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

const css = compile('src/components/dialogHelper/dialoghelper.scss').css + compile('src/components/alphaPicker/style.scss').css;

afterEach(() => {
    document.head.querySelectorAll('style').forEach(style => {
        style.remove();
    });
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('dir');
});

describe('TV letter dialog layout budget', () => {
    it.each(['ltr', 'rtl'])('fits all letter targets at 1080p and 720p (%s)', direction => {
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
        document.documentElement.dir = direction;
        const element = document.createElement('div');
        document.body.appendChild(element);
        const picker = new AlphaPicker({ element, valueChangeEvent: 'click' });
        element.querySelector<HTMLButtonElement>('button')!.click();
        const dialogElement = document.querySelector('.alphaPickerDialog')!;
        expect(dialogElement.classList.contains('dialog')).toBe(true);
        expect(dialogElement.classList.contains('centeredDialog')).toBe(true);
        expect(dialogElement.classList.contains('dialog-fixedSize')).toBe(false);
        expect(dialogElement.classList.contains('dialog-small')).toBe(false);
        expect(dialogElement.parentElement?.classList.contains('dialogContainer')).toBe(true);
        const dialog = getComputedStyle(document.querySelector('.alphaPickerDialog')!);
        const letters = getComputedStyle(document.querySelector('.alphaPickerLetters')!);
        const button = getComputedStyle(document.querySelector('.alphaPickerLetters button')!);
        expect(letters.display).toBe('flex');
        expect(letters.flexWrap).toBe('wrap');
        expect(button.flexShrink).toBe('0');
        expect(dialog.overflowY).toBe('auto');
        expect(document.querySelectorAll('.alphaPickerLetters button')).toHaveLength(28);
        for (const [width, height] of [[1920, 1080], [1280, 720]]) {
            const rootPx = 27;
            const dialogWidth = Math.min(parseFloat(dialog.width) * rootPx, width * parseFloat(dialog.maxWidth) / 100);
            const targetWidth = (dialogWidth - 2 * parseFloat(dialog.padding) * rootPx) * parseFloat(button.flexBasis) / 100;
            const targetHeight = parseFloat(button.minHeight) * rootPx;
            expect(targetWidth).toBeGreaterThanOrEqual(44);
            expect(targetHeight).toBeGreaterThanOrEqual(44);
            // 28 choices form four rows; include padding and a generous heading budget.
            expect(4 * targetHeight + 5 * rootPx).toBeLessThan(height * parseFloat(dialog.maxHeight) / 100);
        }
        picker.destroy();
    });
});
