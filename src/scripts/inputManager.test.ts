import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const services = vi.hoisted(() => ({
    focus: { focusableParent: vi.fn((element: HTMLElement) => element), moveUp: vi.fn(), moveDown: vi.fn(), moveLeft: vi.fn(), moveRight: vi.fn() },
    router: { goHome: vi.fn(), showSettings: vi.fn(), canGoBack: vi.fn(), back: vi.fn() },
    playback: { stop: vi.fn(), seekMs: vi.fn() },
    host: { supports: vi.fn(), exit: vi.fn() }
}));
vi.mock('lib/focusManager', () => ({ default: services.focus }));
vi.mock('components/router/appRouter', () => ({ appRouter: services.router }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: services.playback }));
vi.mock('components/apphost', () => ({ appHost: services.host }));

import { handleCommand, on, off } from './inputManager';

describe('remote command dispatch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        document.body.innerHTML = '<button id="active">Active</button>';
        document.querySelector<HTMLButtonElement>('button')?.focus();
    });
    afterEach(() => vi.useRealTimers());

    it('allows scoped listeners to cancel navigation', () => {
        const cancel = (event: Event) => event.preventDefault();
        on(document, cancel);
        handleCommand('up');
        expect(services.focus.moveUp).not.toHaveBeenCalled();
        off(document, cancel);
        handleCommand('up');
        expect(services.focus.moveUp).toHaveBeenCalledTimes(1);
    });

    it('routes repeated arrows to the top dialog outside the active element', () => {
        document.body.insertAdjacentHTML('beforeend', '<div class="dialogContainer"><div class="dialog opened"></div><div class="dialog opened" id="top"></div></div>');
        const dialog = document.getElementById('top');
        handleCommand('left');
        handleCommand('left');
        handleCommand('right');
        expect(services.focus.moveLeft).toHaveBeenNthCalledWith(1, dialog);
        expect(services.focus.moveLeft).toHaveBeenNthCalledWith(2, dialog);
        expect(services.focus.moveRight).toHaveBeenCalledWith(dialog);
    });

    it('honors an explicit source and canceled commands never reach playback', () => {
        const source = document.createElement('button');
        document.body.appendChild(source);
        const cancel = (event: Event) => event.preventDefault();
        on(source, cancel);
        handleCommand('stop', { sourceElement: source });
        expect(services.playback.stop).not.toHaveBeenCalled();
        off(source, cancel);
        handleCommand('down', { sourceElement: source });
        expect(services.focus.moveDown).toHaveBeenCalledWith(source);
    });

    it('throttles only Stop while repeated arrows remain immediate', () => {
        handleCommand('stop');
        handleCommand('stop');
        handleCommand('up');
        handleCommand('up');
        expect(services.playback.stop).toHaveBeenCalledTimes(1);
        expect(services.focus.moveUp).toHaveBeenCalledTimes(2);
        vi.advanceTimersByTime(1000);
        handleCommand('stop');
        expect(services.playback.stop).toHaveBeenCalledTimes(2);
    });

    it('forwards seek options unchanged and logs unknown commands', () => {
        const options = { sourceElement: document.querySelector<HTMLButtonElement>('button'), position: 1250 };
        const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        handleCommand('seek', options);
        expect(services.playback.seekMs).toHaveBeenCalledWith(options);
        handleCommand('unregistered');
        expect(debug).toHaveBeenCalledWith('inputManager: tried to process command with no action assigned: unregistered');
        debug.mockRestore();
    });

    it('uses Back navigation before native exit', () => {
        services.router.canGoBack.mockReturnValue(true);
        handleCommand('back');
        expect(services.router.back).toHaveBeenCalledOnce();
        expect(services.host.supports).not.toHaveBeenCalled();
        services.router.canGoBack.mockReturnValue(false);
        services.host.supports.mockReturnValue(true);
        handleCommand('back');
        expect(services.host.exit).toHaveBeenCalledOnce();
    });
});
