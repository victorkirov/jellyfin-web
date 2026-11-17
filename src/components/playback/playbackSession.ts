import type { PlaybackContext, PlaybackServices } from './playbackContext';
import PlayQueueManager from './playqueuemanager';
import { bindSkipSegment } from './skipsegment';
import { bindPlaybackRemoteEvents } from './playbackRemoteEvents';
import { createPlaybackState } from './playbackState';
import { createPlaybackRegistry } from './playbackRegistry';
import { createPlaybackStreamChange } from './playbackStreamChange';
import { createPlaybackItems } from './playbackItems';
import { createPlaybackPreparation } from './playbackPreparation';
import { createPlaybackQueue } from './playbackQueue';
import { createPlaybackLifecycle } from './playbackLifecycle';
import { createPlaybackControls } from './playbackControls';

export function initializePlaybackManager(self: PlaybackContext) {
    self._playNextAfterEnded = true;
    self._playQueueManager = new PlayQueueManager();
    // Every callback is installed before player registration can emit events.
    const services = {} as PlaybackServices;
    const playbackState = createPlaybackState(self, services);
    Object.assign(services, playbackState.services);
    const playbackRegistry = createPlaybackRegistry(self, services);
    Object.assign(services, playbackRegistry.services);
    const playbackStreamChange = createPlaybackStreamChange(self, services);
    Object.assign(services, playbackStreamChange.services);
    const playbackItems = createPlaybackItems(self);
    Object.assign(services, playbackItems.services);
    const playbackPreparation = createPlaybackPreparation(self, services);
    Object.assign(services, playbackPreparation.services);
    const playbackQueue = createPlaybackQueue(self, services);
    Object.assign(services, playbackQueue.services);
    const playbackLifecycle = createPlaybackLifecycle(self, services);
    Object.assign(services, playbackLifecycle.services);
    const playbackControls = createPlaybackControls(self, services);
    Object.assign(services, playbackControls.services);
    return {
        services,
        api: { ...playbackState.api, ...playbackRegistry.api, ...playbackItems.api, ...playbackPreparation.api, ...playbackQueue.api, ...playbackLifecycle.api, ...playbackControls.api },
        activate: function () {
            playbackRegistry.activate();
            bindPlaybackRemoteEvents(self);
            self._skipSegment = bindSkipSegment(self);
        }
    };
}
