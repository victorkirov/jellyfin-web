import { beforeEach, expect, it } from 'vitest';
import { createOsdVisibility } from './osdVisibility';

beforeEach(() => {
    document.body.innerHTML = '<style>.hide { display: none; }</style><header></header><section><button>Pause</button></section>';
});

it('hides both playback surfaces immediately and can reopen them', () => {
    const header = document.querySelector('header')!;
    const controls = document.querySelector('section')!;
    const visibility = createOsdVisibility(header, controls);
    visibility.hideHeader();
    visibility.hideControls();
    expect(getComputedStyle(header).display).toBe('none');
    expect(getComputedStyle(controls).display).toBe('none');
    visibility.showHeader();
    visibility.showControls();
    expect(header.classList.contains('osdHeader-hidden')).toBe(false);
    expect(controls.classList.contains('videoOsdBottom-hidden')).toBe(false);
    expect(getComputedStyle(header).display).not.toBe('none');
    expect(getComputedStyle(controls).display).not.toBe('none');
});

it('keeps the surfaces visible when an old transition event arrives after reopening', () => {
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
