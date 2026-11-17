import type { PlayOptions } from 'types/playOptions';

import { PluginType } from 'constants/pluginType';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import screenSaverManager from 'scripts/screensavermanager';
import * as userSettings from 'scripts/settings/userSettings';

export default class PhotoPlayer {
    name = 'Photo Player';
    type = PluginType.MediaPlayer;
    id = 'photoplayer';
    priority = 1;

    async play(options: PlayOptions & { autoplay?: boolean; shuffle?: boolean }) {
        const { default: Slideshow } = await import('../../components/slideshow/slideshow');
        const apiClient = ServerConnections.currentApiClient();
        if (!apiClient) throw new Error('No server connected');
        const user = await apiClient.getCurrentUser();
        const slideshow = new Slideshow({
            showTitle: false,
            cover: false,
            items: options.items,
            startIndex: options.startIndex || 0,
            interval: 11000,
            interactive: true,
            // Shuffle is another slideshow autoplay entry point.
            autoplay: {
                delay: userSettings.slideshowInterval() * 1000,
                enabled: !!(options.autoplay || options.shuffle)
            },
            user,
            onClose: () => screenSaverManager.unblock()
        });

        screenSaverManager.block();
        try {
            slideshow.show();
        } catch (error) {
            screenSaverManager.unblock();
            throw error;
        }
    }

    canPlayMediaType(mediaType?: string) {
        return (mediaType || '').toLowerCase() === 'photo';
    }
}
