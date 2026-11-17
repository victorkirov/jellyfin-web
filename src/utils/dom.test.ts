import { afterEach, describe, expect, it, vi } from 'vitest';
import dom, { parentWithAttribute, parentWithClass, parentWithTag } from './dom';

afterEach(() => {
    document.body.innerHTML = '';
});

describe('legacy DOM utilities', () => {
    it('finds ancestors and stops at the document when no ancestor matches', () => {
        document.body.innerHTML = '<section class="match" data-id="item"><button><span></span></button></section>';
        const section = document.querySelector('section')!;
        const child = document.querySelector('span')!;
        expect(parentWithAttribute(child, 'data-id', 'item')).toBe(section);
        expect(parentWithAttribute(child, 'missing')).toBeNull();
        expect(parentWithTag(child, ['BUTTON', 'SECTION'])).toBe(child.parentElement);
        expect(parentWithTag(child, 'ARTICLE')).toBeNull();
        expect(parentWithClass(child, ['other', 'match'])).toBe(section);
        expect(parentWithClass(child, 'missing')).toBeNull();
    });

    it('registers and removes the original event callback', () => {
        const button = document.createElement('button');
        const listener = vi.fn((event: MouseEvent) => event.type);
        dom.addEventListener(button, 'click', listener, { capture: true, passive: true });
        button.click();
        expect(listener).toHaveBeenCalledOnce();
        dom.removeEventListener(button, 'click', listener, { capture: true, passive: true });
        button.click();
        expect(listener).toHaveBeenCalledOnce();
    });

    it('retains the animation end event used by the excluded video plugin', () => {
        expect(dom.whichAnimationEvent()).toBe('animationend');
    });
});
