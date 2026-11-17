import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Events from 'utils/events';
import { PlayerEvent } from 'lib/playback/constants/playerEvent';
import createVideoController from './index';
import { readFileSync } from 'node:fs';

const template = readFileSync('src/apps/legacy/controllers/playback/video/index.html', 'utf8');

const state = vi.hoisted(() => ({
    player: { name: 'test', id: 'test' },
    upNext: null as null | { hide(): void }
}));

vi.mock('components/playback/playbackmanager', () => ({ playbackManager: {
    getCurrentPlayer: () => state.player,
    getPlayerState: () => ({ PlayState: {} }),
    duration: () => 100,
    getNextItem: () => ({ item: { Id: 'next' } }),
    nextItem: () => Promise.resolve({ Id: 'next' })
} }));
vi.mock('scripts/browser', () => ({ default: {} }));
vi.mock('utils/dom', () => ({ default: {
    addEventListener: (target: EventTarget, name: string, callback: EventListener, options?: AddEventListenerOptions) => target.addEventListener(name, callback, options),
    removeEventListener: (target: EventTarget, name: string, callback: EventListener, options?: EventListenerOptions) => target.removeEventListener(name, callback, options)
} }));
vi.mock('scripts/inputManager', () => ({ default: {
    on: (target: EventTarget, callback: EventListener) => target.addEventListener('command', callback),
    off: (target: EventTarget, callback: EventListener) => target.removeEventListener('command', callback)
} }));
vi.mock('scripts/mouseManager', () => ({ default: { hideCursor: vi.fn() } }));
vi.mock('scripts/datetime', () => ({ default: {} }));
vi.mock('components/itemHelper', () => ({ default: {} }));
vi.mock('components/mediainfo/mediainfo', () => ({ default: {} }));
vi.mock('lib/focusManager', () => ({ default: {
    isCurrentlyFocusable: () => false,
    focus: (element: HTMLElement) => element.focus()
} }));
vi.mock('lib/globalize', () => ({ default: {} }));
vi.mock('components/apphost', () => ({ appHost: {} }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('scripts/settings/userSettings', () => ({ enableNextVideoInfoOverlay: () => true }));
vi.mock('scripts/keyboardNavigation', () => ({ default: {} }));
vi.mock('elements/emby-slider/emby-slider', () => ({}));
vi.mock('elements/emby-button/paper-icon-button-light', () => ({}));
vi.mock('components/buttons/emby-ratingbutton', () => ({}));
vi.mock('scripts/shell', () => ({ default: { enableFullscreen: vi.fn() } }));
vi.mock('components/subtitlesync/subtitlesync', () => ({ default: class {
    toggle() { /* The controller owns visibility; the overlay is outside this fixture. */ }
    destroy() { /* No fixture resources. */ }
} }));
vi.mock('components/router/appRouter', () => ({ appRouter: { goHome: vi.fn() } }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: {} }));
vi.mock('scripts/libraryMenu', () => ({ default: {} }));
vi.mock('components/backdrop/backdrop', () => {
    const levelsExport = 'TRANSPARENCY_LEVEL';
    return { setBackdropTransparency: vi.fn(), [levelsExport]: { Full: 2, None: 0 } };
});
vi.mock('components/upnextdialog/upnextdialog', async () => {
    const { default: events } = await import('utils/events');
    return { default: class {
        constructor() { state.upNext = this; }
        hide() { events.trigger(this, 'hide'); }
        destroy() { /* No fixture resources. */ }
    } };
});

let view: HTMLElement;

beforeEach(() => {
    vi.useFakeTimers();
    state.upNext = null;
    document.body.innerHTML = '<style>.hide { display: none; }</style><header class="skinHeader"></header>' + template;
    view = document.querySelector<HTMLElement>('#videoOsdPage')!;
    for (const slider of Array.from(view.querySelectorAll('input'))) {
        Object.assign(slider, { enableKeyboardDragging: vi.fn() });
    }
    createVideoController(view);
    view.dispatchEvent(new Event('viewshow'));
});

afterEach(() => {
    view.dispatchEvent(new Event('viewbeforehide'));
    view.dispatchEvent(new Event('viewhide'));
    view.dispatchEvent(new Event('viewdestroy'));
    vi.useRealTimers();
});

function command(name: string) {
    window.dispatchEvent(new CustomEvent('command', { detail: { command: name }, cancelable: true }));
}

it('hides both OSD surfaces immediately and reopens the controls on the next command', () => {
    command('back');
    const header = document.querySelector<HTMLElement>('.skinHeader')!;
    const controls = view.querySelector<HTMLElement>('.videoOsdBottom-maincontrols')!;
    expect(getComputedStyle(header).display).toBe('none');
    expect(getComputedStyle(controls).display).toBe('none');
    command('info');
    expect(getComputedStyle(header).display).not.toBe('none');
    expect(getComputedStyle(controls).display).not.toBe('none');
    expect(document.activeElement).toBe(view.querySelector('.btnPause'));
});

it('allows the OSD to open again after the up-next dialog emits hide', async () => {
    command('back');
    Events.trigger(state.player, PlayerEvent.PromptSkip, [{ EndTicks: 100 }]);
    await vi.waitFor(() => expect(state.upNext).not.toBeNull());
    state.upNext!.hide();
    command('info');
    expect(getComputedStyle(view.querySelector('.videoOsdBottom-maincontrols')!).display).not.toBe('none');
    expect(document.activeElement).toBe(view.querySelector('.btnPause'));
});
