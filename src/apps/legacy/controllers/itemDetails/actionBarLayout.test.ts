import { beforeEach, expect, it, vi } from 'vitest';
import { fitActionBar, requestActionBarLayout } from './actionBarLayout';

let page: HTMLElement;
let bar: HTMLElement;
const widths: Record<string, number> = { btnPlay: 400, btnReplay: 200, btnShuffle: 160, btnInstantMix: 160, btnPlayTrailer: 160, btnUserRating: 200, btnPlaystate: 200, btnMoreCommands: 70 };
function collapsed() {
    return Array.from(bar.querySelectorAll<HTMLElement>('.detailButton-iconOnly:not(.btnMoreCommands)')).map(button => button.dataset.name);
}
beforeEach(() => {
    document.body.innerHTML = '<main><div class="mainDetailButtons"></div></main>';
    page = document.querySelector('main')!;
    bar = page.querySelector('div')!;
    Object.defineProperty(bar, 'clientWidth', { configurable: true, value: 1550 });
    for (const name of Object.keys(widths)) {
        const button = document.createElement('button');
        button.className = name + (name === 'btnMoreCommands' ? ' detailButton-iconOnly' : '');
        button.title = name;
        button.dataset.name = name;
        button.getBoundingClientRect = vi.fn(() => ({ width: widths[name], height: 70 } as DOMRect));
        bar.appendChild(button);
    }
});

it.each([
    [1550, []],
    [1500, ['btnShuffle']],
    [1400, ['btnShuffle', 'btnInstantMix']],
    [1300, ['btnShuffle', 'btnInstantMix', 'btnPlayTrailer']],
    [1200, ['btnShuffle', 'btnInstantMix', 'btnPlayTrailer', 'btnUserRating']],
    [1100, ['btnShuffle', 'btnInstantMix', 'btnPlayTrailer', 'btnUserRating', 'btnPlaystate']],
    [900, ['btnReplay', 'btnShuffle', 'btnInstantMix', 'btnPlayTrailer', 'btnUserRating', 'btnPlaystate']]
])('collapses only the necessary lower-priority actions at width %s', (width, expected) => {
    Object.defineProperty(bar, 'clientWidth', { configurable: true, value: width });
    fitActionBar(page);
    expect(collapsed()).toEqual(expected);
    expect(bar.querySelector('.btnPlay')!.classList.contains('detailButton-iconOnly')).toBe(false);
    expect(bar.querySelector('.btnMoreCommands')!.classList.contains('detailButton-iconOnly')).toBe(true);
    for (const button of bar.querySelectorAll<HTMLButtonElement>('button')) {
        expect(button.getAttribute('aria-label')).toBe(button.title);
        expect(button.getBoundingClientRect).toHaveBeenCalledTimes(1);
    }
});

it('restores labels when a later render fits and ignores hidden actions', () => {
    Object.defineProperty(bar, 'clientWidth', { configurable: true, value: 900 });
    fitActionBar(page);
    expect(collapsed()).toHaveLength(6);
    for (const button of bar.querySelectorAll<HTMLButtonElement>('button:not(.btnPlay):not(.btnMoreCommands)')) {
        button.getBoundingClientRect = () => ({ width: 0, height: 0 } as DOMRect);
    }
    fitActionBar(page);
    expect(collapsed()).toEqual([]);
});

it('coalesces synchronous label and visibility changes into one measurement batch', async () => {
    requestActionBarLayout(page);
    requestActionBarLayout(page);
    await Promise.resolve();
    expect(bar.querySelector('button')!.getBoundingClientRect).toHaveBeenCalledTimes(1);
});
