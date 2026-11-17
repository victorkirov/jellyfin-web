import type { PlaybackCandidate, RegistryPlugin } from 'types/plugin';

type BuiltinDefinition = {
    id: string;
    name: string;
    mediaTypes?: string[];
    supportsAnonymous?: boolean;
};

const definitions: Record<string, BuiltinDefinition> = {
    htmlAudioPlayer: { id: 'htmlaudioplayer', name: 'Html Audio Player', mediaTypes: ['audio'] },
    htmlVideoPlayer: { id: 'htmlvideoplayer', name: 'Html Video Player', mediaTypes: ['video'] },
    photoPlayer: { id: 'photoplayer', name: 'Photo Player', mediaTypes: ['photo'] },
    youtubePlayer: { id: 'youtubeplayer', name: 'Youtube Player', mediaTypes: ['audio', 'video'] },
    backdropScreensaver: { id: 'backdropscreensaver', name: 'BackdropScreensaver', supportsAnonymous: false },
    logoScreensaver: { id: 'logoscreensaver', name: 'LogoScreensaver', supportsAnonymous: true }
};

/** Shared by deferred choices and built-in instances; this module loads no player code. */
export function getBuiltinMetadata(pluginSpec: string): RegistryPlugin | undefined {
    if (!pluginSpec.endsWith('/plugin')) return undefined;
    const definition = definitions[pluginSpec.slice(0, -7)];
    if (!definition) return undefined;
    const metadata: RegistryPlugin = {
        id: definition.id,
        name: definition.name,
        type: definition.mediaTypes ? 'mediaplayer' : 'screensaver'
    };
    if (definition.mediaTypes) {
        const mediaTypes = definition.mediaTypes;
        const youtube = definition.id === 'youtubeplayer';
        metadata.priority = 1;
        metadata.canPlayMediaType = mediaType => mediaTypes.includes((mediaType || '').toLowerCase());
        metadata.canPlayItem = item => !youtube && !!item.Id;
        metadata.canPlayUrl = url => youtube && url.toLowerCase().includes('youtube.com');
    } else {
        metadata.supportsAnonymous = definition.supportsAnonymous;
    }
    return metadata;
}

export function canPlayCandidate(plugin: RegistryPlugin, item: PlaybackCandidate): boolean {
    return !!plugin.canPlayMediaType?.(item.MediaType)
        && !!(item.Id ? plugin.canPlayItem?.(item) : item.Url && plugin.canPlayUrl?.(item.Url));
}
