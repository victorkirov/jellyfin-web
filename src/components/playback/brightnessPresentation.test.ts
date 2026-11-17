import { describe, expect, it, vi } from 'vitest';

import { PlaybackManagerEvent } from 'lib/playback/constants/playbackManagerEvent';
import Events from 'utils/events';

import { bindBrightnessPresentation } from './brightnessPresentation';

const loaded = vi.hoisted(() => vi.fn());
vi.mock('./brightnessosd', () => {
    loaded();
    return {};
});

describe('brightness presentation ownership', () => {
    it('keeps the overlay deferred until playback requests brightness', async () => {
        const manager = {};
        bindBrightnessPresentation(manager);
        expect(loaded).not.toHaveBeenCalled();
        Events.trigger(manager, PlaybackManagerEvent.BrightnessRequested);
        Events.trigger(manager, PlaybackManagerEvent.BrightnessRequested);
        await vi.waitFor(() => expect(loaded).toHaveBeenCalledOnce());
    });
});
