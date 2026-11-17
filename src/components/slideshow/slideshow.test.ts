import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Slideshow from './slideshow';

const mocks = vi.hoisted(() => ({
    screenfull: { isFullscreen: true, exit: vi.fn() },
    inputOn: vi.fn(),
    inputOff: vi.fn(),
    autoplay: { running: false, start: vi.fn(), stop: vi.fn() },
    destroy: vi.fn(),
    swiper: vi.fn()
}));

vi.mock('screenfull', () => ({ default: mocks.screenfull }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: {} }));
vi.mock('../apphost', () => ({ appHost: { setUserScalable: vi.fn() } }));
vi.mock('../../scripts/browser', () => ({ default: {} }));
vi.mock('../../scripts/inputManager', () => ({
    default: { on: mocks.inputOn, off: mocks.inputOff }
}));
vi.mock('../dialogHelper/dialogHelper', () => ({
    default: {
        createDialog: () => {
            const dialog = document.createElement('div');
            document.body.appendChild(dialog);
            return dialog;
        },
        open: () => Promise.resolve(),
        close: (dialog: HTMLElement) => dialog.dispatchEvent(new Event('close'))
    }
}));
vi.mock('swiper', () => ({
    Swiper: function (...args: unknown[]) {
        mocks.swiper(...args);
        return { autoplay: mocks.autoplay, destroy: mocks.destroy };
    }
}));

vi.mock('swiper/modules', () => ({ Virtual: vi.fn(), Keyboard: vi.fn(), Autoplay: vi.fn(), Zoom: vi.fn(), A11y: vi.fn() }));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.autoplay.running = false;
    mocks.autoplay.start.mockImplementation(() => {
        mocks.autoplay.running = true;
    });
    mocks.autoplay.stop.mockImplementation(() => {
        mocks.autoplay.running = false;
    });
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('TV slideshow playback', () => {
    it('toggles autoplay from remote commands without a toolbar', async () => {
        const onClose = vi.fn();
        const slideshow = new Slideshow({ interactive: true, slides: [], onClose });
        slideshow.show();
        await vi.waitFor(() => expect(mocks.swiper).toHaveBeenCalledOnce());

        expect(document.querySelector('.slideshowSwiperContainer')).not.toBeNull();
        expect(document.querySelector('button')).toBeNull();
        const onInput = mocks.inputOn.mock.calls[0][1];
        const command = (value: string) => onInput({ detail: { command: value } });

        command('playpause');
        expect(mocks.autoplay.start).toHaveBeenCalledOnce();
        command('playpause');
        expect(mocks.autoplay.stop).toHaveBeenCalledOnce();
        command('play');
        expect(mocks.autoplay.running).toBe(true);
        command('pause');
        expect(mocks.autoplay.running).toBe(false);

        slideshow.hide();
        expect(mocks.screenfull.exit).toHaveBeenCalledOnce();
        expect(mocks.destroy).toHaveBeenCalledWith(true, true);
        expect(mocks.inputOff).toHaveBeenCalledWith(window, onInput);
        expect(onClose).toHaveBeenCalledOnce();
    });
});

it('switches slides without a transition duration', async () => {
    const slideshow = new Slideshow({ slides: [] });
    slideshow.show();
    await vi.waitFor(() => expect(mocks.swiper).toHaveBeenCalledOnce());
    expect(mocks.swiper.mock.calls[0][1]).toMatchObject({ speed: 0 });
    slideshow.hide();
});
