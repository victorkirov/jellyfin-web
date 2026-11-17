import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { MediaType } from '@jellyfin/sdk/lib/generated-client/models/media-type';

import { PluginType } from 'constants/pluginType';

import type { PlayOptions } from './playOptions';

export interface Plugin {
    /** The name of the plugin */
    name: string
    /** The unique identifier for the plugin */
    id: string
    /** The type of the plugin */
    type: PluginType | string
    /** The priority of the plugin, used to determine the order of execution */
    priority?: number
}

export abstract class PlayerPlugin implements Plugin {
    type = PluginType.MediaPlayer;
    /** The name of the plugin */
    abstract name: string;
    /** The unique identifier for the plugin */
    abstract id: string;
    /** The priority of the plugin, used to determine the order of execution */
    priority?: number;
    /** Indicates if the player is a local player */
    isLocalPlayer?: boolean;
}

export interface InterceptOptions extends PlayOptions {
    /** The item being played */
    item: BaseItemDto
    /** The media type of the item */
    mediaType?: MediaType
}

export abstract class PreplayInterceptPlugin implements Plugin {
    type = PluginType.PreplayIntercept;
    /** The name of the plugin */
    abstract name: string;
    /** The unique identifier for the plugin */
    abstract id: string;
    /** The priority of the plugin, used to determine the order of execution */
    priority?: number;

    /**
     * The function called prior to playback starting.
     * Returning a rejected promise will prevent playback from starting, while a resolved promise will allow it to proceed.
     */
    abstract intercept(options: InterceptOptions): Promise<void>;
}

/** Capabilities exposed by legacy plugins, including optional media operations. */
export type PlaybackCandidate = {
    Id?: string | null;
    MediaType?: string | null;
    Url?: string | null;
};

export type RegistryPlugin = Plugin & {
    packageName?: string;
    installUrl?: string;
    baseUrl?: string;
    supportsAnonymous?: boolean;
    getTranslations?: () => { lang: string; path: string }[];
    canPlayMediaType?: (mediaType?: string | null) => boolean;
    canPlayItem?: (item: PlaybackCandidate) => boolean;
    canPlayUrl?: (url: string) => boolean;
    load?: () => Promise<RegistryPlugin | string>;
    show?: () => void | Promise<void>;
    hide?: () => void | Promise<void>;
};

export type PluginConstructor = new (dependencies?: Record<string, unknown>) => RegistryPlugin;
export type PluginSpec = string | Promise<{ default: PluginConstructor }>;
