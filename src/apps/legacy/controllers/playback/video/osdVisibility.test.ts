import { beforeEach, expect, it, vi } from 'vitest';
import { createOsdVisibility } from './osdVisibility';

vi.mock('utils/dom', () => ({ default: { whichTransitionEvent: () => 'transitionend' } }));

beforeEach(() => {
    document.body.innerHTML = '<style>.hide { display: none; }</style><header></header><section><button>Pause</button></section>';
});

it('hides both playback surfaces when their transition finishes and can reopen them', () => {
    const header = document.querySelector('header')!;
    const controls = document.querySelector('section')!;
    const visibility = createOsdVisibility(header, controls);
    visibility.hideHeader();
    visibility.hideControls();
    header.dispatchEvent(new Event('transitionend'));
    controls.dispatchEvent(new Event('transitionend'));
    expect(getComputedStyle(header).display).toBe('none');
    expect(getComputedStyle(controls).display).toBe('none');
    visibility.showHeader();
    visibility.showControls();
    expect(header.classList.contains('osdHeader-hidden')).toBe(false);
    expect(controls.classList.contains('videoOsdBottom-hidden')).toBe(false);
    expect(getComputedStyle(header).display).not.toBe('none');
    expect(getComputedStyle(controls).display).not.toBe('none');
});

it('cancels a pending hide when the surfaces reopen before their transition ends', () => {
    const header = document.querySelector('header')!;
    const controls = document.querySelector('section')!;
    const visibility = createOsdVisibility(header, controls);
    visibility.hideHeader();
    visibility.hideControls();
    visibility.showHeader();
    visibility.showControls();
    header.dispatchEvent(new Event('transitionend'));
    controls.dispatchEvent(new Event('transitionend'));
    expect(getComputedStyle(header).display).not.toBe('none');
    expect(getComputedStyle(controls).display).not.toBe('none');
});
