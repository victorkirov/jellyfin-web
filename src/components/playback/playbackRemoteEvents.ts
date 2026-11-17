import { OutboundWebSocketMessageType } from '@jellyfin/sdk/lib/websocket';
import { AppFeature } from 'constants/appFeature';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import Events from '../../utils/events';
import { appHost } from '../apphost';
import type { PlaybackContext } from './playbackContext';

export function bindPlaybackRemoteEvents(self: PlaybackContext) {
    if (appHost.supports(AppFeature.RemoteControl)) {
        // Defer setup past module evaluation to avoid the circular dependency:
        // playbackmanager → lib/jellyfin-apiclient → ServerConnections → components/dashboard → backdrop → playbackmanager
        queueMicrotask(() => {
            let _unsubscribeRemoteControl: (() => void) | undefined;
            Events.on(ServerConnections, 'localusersignedin', () => {
                _unsubscribeRemoteControl?.();
                const api = ServerConnections.getApi();
                _unsubscribeRemoteControl = api?.subscribe(
                    [OutboundWebSocketMessageType.ServerShuttingDown, OutboundWebSocketMessageType.ServerRestarting],
                    self.setDefaultPlayerActive.bind(self)
                );
            });
            Events.on(ServerConnections, 'localusersignedout', () => {
                _unsubscribeRemoteControl?.();
            });
        });
    }
}
