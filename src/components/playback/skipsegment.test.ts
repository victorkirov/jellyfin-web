import { afterEach, expect, it, vi } from 'vitest';
import type { PlaybackManager } from './playbackmanager';
import { bindSkipSegment } from './skipsegment';

vi.mock('./playbackmanager', () => ({}));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('scripts/settings/userSettings', () => ({ enableNextVideoInfoOverlay: () => false }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('lib/focusManager', () => ({ default: {
    isCurrentlyFocusable: () => true,
    focus: (element: HTMLElement) => element.focus()
} }));

afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
});

it('hides a focused skip button immediately and returns focus to Pause', () => {
    vi.useFakeTimers();
    const manager = { getCurrentPlayer: () => null } as unknown as PlaybackManager;
    const skip = bindSkipSegment(manager);
    document.body.innerHTML = '<button class="btnPause">Pause</button>';
    skip.onPromptSkip({ type: 'promptskip' }, { EndTicks: 100000000, Type: 'Intro' });
    const button = document.querySelector<HTMLButtonElement>('.skip-button')!;
    button.focus();
    skip.hideSkipButton();
    expect(button.classList.contains('hide')).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('.btnPause'));
    skip.showSkipButton({ keep: true });
    expect(button.classList.contains('hide')).toBe(false);
    expect(button.classList.contains('skip-button-hidden')).toBe(false);
});
