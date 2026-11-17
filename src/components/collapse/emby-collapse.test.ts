import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('webcomponents.js/webcomponents-lite', () => ({}));
vi.mock('../buttons/emby-button', () => ({}));

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    Reflect.deleteProperty(document, 'registerElement');
});

describe('collapse lifecycle', () => {
    it('expands and collapses through its button', async () => {
        vi.useFakeTimers();
        const register = vi.fn();
        Object.assign(document, { registerElement: register });
        await import('./emby-collapse');
        const prototype = register.mock.calls[0][1].prototype as { attachedCallback: (this: HTMLElement) => void };
        const collapse = document.createElement('div');
        collapse.innerHTML = '<div class="collapseContent">Contents</div>';
        document.body.appendChild(collapse);
        prototype.attachedCallback.call(collapse);
        const button = collapse.querySelector('button')!;
        const content = collapse.querySelector('.collapseContent')!;
        button.click();
        vi.runAllTimers();
        expect(content.classList.contains('hide')).toBe(false);
        button.click();
        vi.runAllTimers();
        expect(content.classList.contains('hide')).toBe(true);
    });
});
