import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client';

import { PluginType } from 'constants/pluginType';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import screenSaverManager from 'scripts/screensavermanager';
import * as userSettings from 'scripts/settings/userSettings';

type PhotoPlayOptions = {
    items?: BaseItemDto[] | null;
    startIndex?: number;
    autoplay?: boolean;
    shuffle?: boolean;
};

export default class PhotoPlayer {
    name: string;
    type: PluginType;
    id: string;
    priority: number;

    constructor() {
        this.name = 'Photo Player';
        this.type = PluginType.MediaPlayer;
        this.id = 'photoplayer';
        this.priority = 1;
    }

    play(options: PhotoPlayOptions) {
        return new Promise<void>(function (resolve) {
            import('../../components/slideshow/slideshow').then(({ default: Slideshow }) => {
                const index = options.startIndex || 0;

                const apiClient = ServerConnections.currentApiClient();
                apiClient.getCurrentUser().then(function(result) {
                    const newSlideShow = new Slideshow({
                        showTitle: false,
                        cover: false,
                        items: options.items,
                        startIndex: index,
                        interval: 11000,
                        interactive: true,
                        // playbackManager.shuffle has no options. So treat 'shuffle' as a 'play' action
                        autoplay: {
                            delay: userSettings.slideshowInterval() * 1000,
                            enabled: !!(options.autoplay || options.shuffle)
                        },
                        user: result,
                        onClose: () => screenSaverManager.unblock()
                    });

                    screenSaverManager.block();
                    newSlideShow.show();
                    resolve();
                });
            });
        });
    }

    canPlayMediaType(mediaType?: string) {
        return (mediaType || '').toLowerCase() === 'photo';
    }
}
