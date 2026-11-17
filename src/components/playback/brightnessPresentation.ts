import { PlaybackManagerEvent } from 'lib/playback/constants/playbackManagerEvent';
import Events from 'utils/events';

export function bindBrightnessPresentation(manager: object) {
    let requested = false;
    Events.on(manager, PlaybackManagerEvent.BrightnessRequested, () => {
        if (requested) return;
        requested = true;
        void import('./brightnessosd').catch(() => {
            requested = false;
            console.warn('[brightnessPresentation] failed to load the brightness overlay');
        });
    });
}
