import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/focusManager', () => ({ default: { pushScope: vi.fn(), popScope: vi.fn(), autoFocus: vi.fn(), focus: vi.fn() } }));
vi.mock('../../scripts/browser', () => ({ default: { tv: false, touch: false } }));
vi.mock('../../lib/layoutManager', () => ({ default: { tv: false } }));
vi.mock('../../scripts/inputManager', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('../loading/loading', () => ({ hide: vi.fn() }));
vi.mock('lib/navigationHistory', () => ({ history: { location: { state: null } } }));

import focusManager from '../../lib/focusManager';
import { close, createDialog, open } from './dialogHelper';

afterEach(() => {
    document.body.innerHTML = '';
});

describe('instant dialog lifecycle', () => {
    it('shows the backdrop and releases focus and backdrop when closed', async () => {
        const dialog = createDialog({ enableHistory: false, scrollY: false });
        const closing = vi.fn();
        dialog.addEventListener('close', closing);
        const closed = open(dialog);
        expect(dialog.classList.contains('hide')).toBe(false);
        expect(document.querySelector('.dialogBackdropOpened')).not.toBeNull();
        expect(focusManager.pushScope).toHaveBeenCalledWith(dialog);
        close(dialog);
        expect(document.querySelector('.dialogBackdrop')).toBeNull();
        expect(dialog.classList.contains('hide')).toBe(true);
        await expect(closed).resolves.toEqual({ element: dialog });
        expect(closing).toHaveBeenCalledOnce();
        expect(focusManager.popScope).toHaveBeenCalledOnce();
    });
});
