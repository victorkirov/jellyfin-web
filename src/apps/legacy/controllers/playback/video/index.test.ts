import { beforeEach, describe, expect, it, vi } from 'vitest';
import Events from 'utils/events';
import createController from './index';
import { readFileSync } from 'node:fs';

const viewHtml = readFileSync('src/apps/legacy/controllers/playback/video/index.html', 'utf8');

const { manager } = vi.hoisted(() => ({ manager: {} }));

vi.mock('components/playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('scripts/browser', () => ({ default: {} }));
vi.mock('utils/dom', () => ({ default: { whichTransitionEvent: () => 'transitionend', addEventListener: () => undefined } }));
vi.mock('scripts/inputManager', () => ({ default: {} }));
vi.mock('scripts/mouseManager', () => ({ default: {} }));
vi.mock('scripts/datetime', () => ({ default: {} }));
vi.mock('components/itemHelper', () => ({ default: {} }));
vi.mock('components/mediainfo/mediainfo', () => ({ default: {} }));
vi.mock('components/focusManager', () => ({ default: {} }));
vi.mock('lib/globalize', () => ({ default: {} }));
vi.mock('components/apphost', () => ({ appHost: {} }));
vi.mock('components/layoutManager', () => ({ default: {} }));
vi.mock('scripts/settings/userSettings', () => ({ default: {} }));
vi.mock('scripts/keyboardNavigation', () => ({ default: {} }));
vi.mock('scripts/shell', () => ({ default: { enableFullscreen: () => undefined } }));
vi.mock('components/subtitlesync/subtitlesync', () => ({ default: {} }));
vi.mock('components/router/appRouter', () => ({ appRouter: {} }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: {} }));
vi.mock('scripts/libraryMenu', () => ({ default: {} }));
vi.mock('components/backdrop/backdrop', () => ({ setBackdropTransparency: {} }));
vi.mock('components/pluginManager', () => ({ pluginManager: { firstOfType: () => ({ instance: { Manager: manager } }) } }));
vi.mock('styles/scrollstyles.scss', () => ({}));
vi.mock('elements/emby-slider/emby-slider', () => ({}));
vi.mock('elements/emby-button/paper-icon-button-light', () => ({}));
vi.mock('elements/emby-ratingbutton/emby-ratingbutton', () => ({}));
vi.mock('styles/videoosd.scss', () => ({}));

describe('SyncPlay OSD listener lifecycle', () => {
    function createView() {
        const container = document.createElement('div');
        container.innerHTML = viewHtml;
        const view = container.firstElementChild as HTMLElement;
        for (const slider of view.querySelectorAll('input')) {
            Object.assign(slider, { enableKeyboardDragging: () => undefined });
        }
        createController.call({}, view);
        return view;
    }

    beforeEach(() => {
        document.body.innerHTML = '<div class="skinHeader"></div>';
    });

    it('removes only the destroyed view listeners for all three events', () => {
        const oldView = createView();
        const activeView = createView();
        const off = vi.spyOn(Events, 'off');
        oldView.dispatchEvent(new Event('viewdestroy'));
        expect(off.mock.calls.map(call => call[1])).toEqual(['enabled', 'notify-osd', 'group-state-update']);
        const oldQuery = vi.spyOn(oldView, 'querySelector');
        const activeQuery = vi.spyOn(activeView, 'querySelector');
        Events.trigger(manager, 'enabled', [false]);
        Events.trigger(manager, 'notify-osd', ['clear']);
        Events.trigger(manager, 'group-state-update', ['Paused', 'Ready']);
        expect(oldQuery).not.toHaveBeenCalled();
        expect(activeQuery).toHaveBeenCalledTimes(3);
        activeView.dispatchEvent(new Event('viewdestroy'));
        activeQuery.mockClear();
        Events.trigger(manager, 'enabled', [false]);
        expect(activeQuery).not.toHaveBeenCalled();
    });
});
