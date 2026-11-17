import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../lib/focusManager', () => ({ default: { pushScope: vi.fn(), popScope: vi.fn(), autoFocus: vi.fn(), focus: vi.fn() } }));
vi.mock('../../scripts/browser', () => ({ default: { tv: true, touch: false } }));
vi.mock('../../lib/layoutManager', () => ({ default: { tv: false } }));
vi.mock('../../scripts/inputManager', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('../loading/loading', () => ({ hide: vi.fn() }));
vi.mock('lib/navigationHistory', async () => {
    const { createMemoryHistory } = await import('history');
    return { history: createMemoryHistory() };
});

import { history } from 'lib/navigationHistory';
import { close, createDialog, open } from './dialogHelper';

afterEach(() => {
    document.body.innerHTML = '';
});

it('removes a synchronous history listener before a later dialog opens', async () => {
    const first = createDialog({ scrollY: false });
    const firstClosed = vi.fn();
    first.addEventListener('close', firstClosed);
    const closed = open(first);
    close(first);
    await closed;
    expect(firstClosed).toHaveBeenCalledOnce();
    const next = createDialog({ scrollY: false });
    const nextClosed = open(next);
    expect(firstClosed).toHaveBeenCalledOnce();
    history.back();
    await nextClosed;
    expect(document.querySelector('.dialog')).toBeNull();
    expect(firstClosed).toHaveBeenCalledOnce();
});

it('removes dialogs immediately while awaiting asynchronous history acknowledgement', async () => {
    const originalBack = history.back.bind(history);
    vi.spyOn(history, 'back').mockImplementation(() => {
        void Promise.resolve().then(originalBack);
    });
    const dialog = createDialog({ scrollY: false });
    const onClose = vi.fn();
    dialog.addEventListener('close', onClose);
    const closed = open(dialog);
    close(dialog);
    expect(document.querySelector('.dialog')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await closed;
    expect(onClose).toHaveBeenCalledOnce();
});
