import Events from '../utils/events';
import type { RegistryPlugin, PluginSpec, PluginConstructor, PlaybackCandidate } from '../types/plugin';
import globalize from '../lib/globalize';
import loading from './loading/loading';
import appSettings from '../scripts/settings/appSettings';
import { playbackManager } from './playback/playbackmanager';
import { appHost } from '../components/apphost';
import { appRouter } from './router/appRouter';
import * as inputManager from '../scripts/inputManager';
import toast from '../components/toast/toast';
import confirm from '../components/confirm/confirm';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import * as dashboard from './dashboard';

export class PluginManager {
    pluginsList: RegistryPlugin[] = [];

    get plugins() {
        return this.pluginsList;
    }

    private loadStrings(plugin: RegistryPlugin) {
        const strings = plugin.getTranslations ? plugin.getTranslations() : [];
        return globalize.loadStrings({
            // Dictionary names were already coerced to object keys by globalize.
            name: String(plugin.id || plugin.packageName),
            strings: strings
        });
    }

    private async registerPlugin(plugin: RegistryPlugin) {
        this.register(plugin);

        // Skins load translations when selected.
        if (plugin.type !== 'skin') await this.loadStrings(plugin);
        return plugin;
    }

    private async preparePlugin(pluginSpec: PluginSpec, plugin: RegistryPlugin) {
        if (typeof pluginSpec === 'string') {
            // See if it's already installed
            const existing = this.plugins.filter(function (p) {
                return p.id === plugin.id && !p.load;
            })[0];

            if (existing) {
                return pluginSpec;
            }

            plugin.installUrl = pluginSpec;

            const separatorIndex = Math.max(pluginSpec.lastIndexOf('/'), pluginSpec.lastIndexOf('\\'));
            plugin.baseUrl = pluginSpec.substring(0, separatorIndex);
        }

        return this.registerPlugin(plugin);
    }

    registerDeferredPlugin(pluginSpec: PluginSpec) {
        const definitions: Record<string, [string, string, string?]> = {
            htmlAudioPlayer: ['htmlaudioplayer', 'Html Audio Player', 'Audio'],
            htmlVideoPlayer: ['htmlvideoplayer', 'Html Video Player', 'Video'],
            photoPlayer: ['photoplayer', 'Photo Player', 'Photo'],
            youtubePlayer: ['youtubeplayer', 'Youtube Player', 'Audio,Video'],
            backdropScreensaver: ['backdropscreensaver', 'BackdropScreensaver'],
            logoScreensaver: ['logoscreensaver', 'LogoScreensaver']
        };
        const definition = typeof pluginSpec === 'string' && pluginSpec.endsWith('/plugin') ?
            definitions[pluginSpec.slice(0, -7)] : undefined;
        if (!definition || typeof pluginSpec !== 'string' || pluginSpec in window) return this.loadPlugin(pluginSpec);
        const [id, name, mediaTypes] = definition;
        let pending: Promise<RegistryPlugin | string> | undefined;
        let implementation: RegistryPlugin | string | undefined;
        let activation = 0;
        const descriptor: RegistryPlugin & Required<Pick<RegistryPlugin, 'load' | 'show' | 'hide'>> = {
            id,
            name,
            type: mediaTypes ? 'mediaplayer' : 'screensaver',
            priority: 1,
            supportsAnonymous: id === 'logoscreensaver',
            canPlayMediaType: (type: string | null | undefined) => !!mediaTypes?.toLowerCase().split(',').includes((type || '').toLowerCase()),
            canPlayItem: item => id !== 'youtubeplayer' && !!item.Id,
            canPlayUrl: url => id === 'youtubeplayer' && url.toLowerCase().includes('youtube.com'),
            load: () => {
                if (!pending) {
                    pending = this.loadPlugin(pluginSpec).then(plugin => {
                        implementation = plugin;
                        return plugin;
                    }).catch(error => {
                        pending = undefined;
                        throw error;
                    });
                }
                return pending;
            },
            show: () => {
                const currentActivation = ++activation;
                return descriptor.load().then(plugin => {
                    if (currentActivation === activation) return (plugin as RegistryPlugin).show?.();
                });
            },
            hide: () => {
                activation++;
                return implementation ? (implementation as RegistryPlugin).hide?.() : Promise.resolve();
            }
        };
        this.pluginsList.push(descriptor);
        return Promise.resolve(descriptor);
    }

    canPlayDeferred(item: PlaybackCandidate) {
        return this.plugins.some(plugin => plugin.load && plugin.type === 'mediaplayer'
            && plugin.canPlayMediaType?.(item.MediaType)
            && (item.Id ? plugin.canPlayItem?.(item) : item.Url && plugin.canPlayUrl?.(item.Url)));
    }

    async prepareForPlayback(items: PlaybackCandidate[]) {
        const plugins = this.plugins.filter(plugin => plugin.load && plugin.type === 'mediaplayer'
            && items.some(item => plugin.canPlayMediaType?.(item.MediaType)
                && (item.Id ? plugin.canPlayItem?.(item) : item.Url && plugin.canPlayUrl?.(item.Url))));
        await Promise.all(plugins.map(plugin => plugin.load?.()));
    }

    async loadPlugin(pluginSpec: PluginSpec): Promise<RegistryPlugin | string> {
        let plugin: RegistryPlugin;

        if (typeof pluginSpec === 'string') {
            if (pluginSpec in window) {
                console.log(`Loading plugin (via window): ${pluginSpec}`);

                const pluginDefinition = await (window as unknown as Record<string, unknown>)[pluginSpec];
                if (typeof pluginDefinition !== 'function') {
                    throw new TypeError('Plugin definitions in window have to be an (async) function returning the plugin class');
                }

                const PluginClass: unknown = await pluginDefinition();
                if (typeof PluginClass !== 'function') {
                    throw new TypeError(`Plugin definition doesn't return a class for '${pluginSpec}'`);
                }

                // init plugin and pass basic dependencies
                plugin = new (PluginClass as PluginConstructor)({
                    events: Events,
                    loading,
                    appSettings,
                    playbackManager,
                    globalize,
                    appHost,
                    appRouter,
                    inputManager,
                    toast,
                    confirm,
                    dashboard,
                    ServerConnections
                });
            } else {
                console.debug(`Loading plugin (via dynamic import): ${pluginSpec}`);
                const pluginResult = await import(/* webpackChunkName: "[request]" */ `../plugins/${pluginSpec}`);
                plugin = new pluginResult.default;
            }
        } else {
            console.debug('Loading plugin (via promise/async function)');

            const pluginResult = await pluginSpec;
            plugin = new pluginResult.default;
        }

        return this.preparePlugin(pluginSpec, plugin);
    }

    // In lieu of automatic discovery, plugins will register dynamic objects
    // Each object will have the following properties:
    // name
    // type (skin, screensaver, etc)
    private register(obj: RegistryPlugin) {
        const index = this.pluginsList.findIndex(plugin => plugin.load && plugin.id === obj.id);
        if (index === -1) this.pluginsList.push(obj);
        else this.pluginsList[index] = obj;
        Events.trigger(this, 'registered', [obj]);
    }

    ofType(type: string) {
        return this.pluginsList.filter(plugin => plugin.type === type);
    }

    firstOfType(type: string) {
        // Get all plugins of the specified type
        return this.ofType(type)
            // Return the plugin with the "highest" (lowest numeric value) priority
            .sort((p1, p2) => (p1.priority || 0) - (p2.priority || 0))[0];
    }
}

export const pluginManager = new PluginManager();
