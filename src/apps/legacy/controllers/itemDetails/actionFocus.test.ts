import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import inputManager from 'scripts/inputManager';
import { bindActionFocus } from './actionFocus';

vi.mock('lib/scrollManager', () => ({ default: { isEnabled: () => false } }));
let page: HTMLElement;
let unbind: () => void;

function position(element: HTMLElement, left: number, top: number, width = 100, height = 70) {
    Object.defineProperty(element, 'offsetParent', { configurable: true, value: page });
    element.getBoundingClientRect = () => ({ left, right: left + width, top, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) });
}

beforeEach(() => {
    document.body.innerHTML = readFileSync('src/apps/legacy/controllers/itemDetails/index.html', 'utf8');
    page = document.querySelector<HTMLElement>('#itemDetailPage')!;
    // Model the rendered controller state, with no unsupported trailer or restart.
    page.querySelectorAll<HTMLButtonElement>('.mainDetailButtons button').forEach((button, index) => {
        if (!button.matches('.btnReplay, .btnPlayTrailer, .btnInstantMix, .btnShuffle')) {
            button.classList.remove('hide');
            position(button, 600 + index * 130, 300);
        }
    });
    unbind = bindActionFocus(page);
});
afterEach(() => unbind());

describe('Details remote focus boundaries', () => {
    it('walks visible actions in order and clamps at both ends', () => {
        const buttons = [...page.querySelectorAll<HTMLButtonElement>('.mainDetailButtons button:not(.hide)')];
        buttons[0].focus();
        inputManager.handleCommand('left');
        expect(document.activeElement).toBe(buttons[0]);
        for (const button of buttons.slice(1)) {
            inputManager.handleCommand('right');
            expect(document.activeElement).toBe(button);
        }
        inputManager.handleCommand('right');
        expect(document.activeElement).toBe(buttons[buttons.length - 1]);
        for (const button of buttons.slice(0, -1).reverse()) {
            inputManager.handleCommand('left');
            expect(document.activeElement).toBe(button);
        }
    });

    it('returns Up to Play even when the lower control is aligned with More', () => {
        const more = page.querySelector<HTMLElement>('.btnMoreCommands')!;
        const control = page.querySelector<HTMLElement>('.overview-expand')!;
        control.classList.remove('hide');
        position(control, more.getBoundingClientRect().left, 450);
        control.focus();
        inputManager.handleCommand('up');
        expect(document.activeElement).toBe(page.querySelector('.btnPlay'));
    });

    it('keeps Right in an episode list while Up and Down leave it', () => {
        const container = page.querySelector<HTMLElement>('#listChildrenCollapsible .itemsContainer')!;
        container.innerHTML = '<button class="episode">Episode</button>';
        const episode = container.querySelector<HTMLElement>('button')!;
        const cast = page.querySelector<HTMLElement>('#castContent')!;
        cast.innerHTML = '<button>Cast member</button>';
        const person = cast.querySelector<HTMLElement>('button')!;
        position(episode, 600, 500, 900, 100);
        position(person, 1550, 500);
        episode.focus();
        inputManager.handleCommand('right');
        expect(document.activeElement).toBe(episode);
        inputManager.handleCommand('up');
        expect(document.activeElement).toBe(page.querySelector('.btnPlay'));
        position(person, 600, 700);
        episode.focus();
        inputManager.handleCommand('down');
        expect(document.activeElement).toBe(person);
    });

    it('does not interfere with a command already handled by a child control', () => {
        const select = page.querySelector<HTMLElement>('.selectAudio')!;
        position(select, 800, 500);
        select.addEventListener('command', event => event.preventDefault());
        select.focus();
        inputManager.handleCommand('up');
        expect(document.activeElement).toBe(select);
    });
});
