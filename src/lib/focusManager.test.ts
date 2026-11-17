import { afterEach, expect, it, vi } from 'vitest';
import focusManager from './focusManager';
import sharedFocusManager from 'lib/focusManager';

vi.mock('./scrollManager', () => ({ default: {} }));

afterEach(() => {
    focusManager.popScope();
    focusManager.popScope();
    document.body.innerHTML = '';
});

it('shares dialog scopes and safely returns to the document after nested closes', () => {
    expect(sharedFocusManager).toBe(focusManager);
    document.body.innerHTML = '<button id="page">Page</button><div id="outer"><button>Outer</button><div id="inner"><button>Inner</button></div></div>';
    const outer = document.getElementById('outer')!;
    const inner = document.getElementById('inner')!;
    const buttons = Array.from(document.querySelectorAll('button'));
    buttons.forEach(button => {
        Object.defineProperty(button, 'offsetParent', { value: document.body });
    });

    focusManager.pushScope(outer);
    sharedFocusManager.pushScope(inner);
    expect(focusManager.getFocusableElements()).toEqual(buttons.slice(1));
    expect(sharedFocusManager.popScope()).toBeUndefined();
    expect(focusManager.getFocusableElements()).toEqual(buttons.slice(1));
    focusManager.popScope();
    expect(sharedFocusManager.getFocusableElements()).toEqual(buttons);
    expect(() => focusManager.popScope()).not.toThrow();
    expect(sharedFocusManager.getFocusableElements()).toEqual(buttons);
});
