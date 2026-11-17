import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    render: vi.fn(),
    registerPlugin: vi.fn(),
    getPlugins: vi.fn(),
    enableKeyboard: vi.fn(),
    enableFocus: vi.fn()
}));
vi.mock('lib/legacy', () => ({}));
vi.mock('react-dom/client', () => ({ createRoot: () => ({ render: mocks.render }) }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: {
    getLastUsedServer: () => undefined, getApiClients: () => []
} }));
vi.mock('components/playback/playbackmanager', () => ({}));
vi.mock('./components/apphost', () => ({ appHost: { init: () => Promise.resolve() } }));
vi.mock('./components/autoFocuser', () => ({ default: { enable: mocks.enableFocus } }));
vi.mock('components/loading/loading', () => ({ default: { show: vi.fn() } }));
vi.mock('./components/pluginManager', () => ({ pluginManager: { registerDeferredPlugin: mocks.registerPlugin } }));
vi.mock('./components/router/appRouter', () => ({ appRouter: {} }));
vi.mock('./lib/globalize', () => ({ default: {} }));
vi.mock('lib/globalize/loader', () => ({ loadCoreDictionary: () => Promise.resolve() }));
vi.mock('./scripts/keyboardNavigation', () => ({ default: { enable: mocks.enableKeyboard } }));
vi.mock('./scripts/settings/webSettings', () => ({ getPlugins: mocks.getPlugins }));
vi.mock('./components/dashboard', () => ({ pageClassOn: vi.fn(), serverAddress: () => Promise.resolve() }));
vi.mock('utils/jellyfin-apiclient/compat', () => ({ updateApiClientSdk: vi.fn() }));
vi.mock('./scripts/serverNotifications', () => ({ initializeServerConnections: vi.fn() }));
vi.mock('./RootApp', () => ({ default: () => null }));
vi.mock('./components/buttons/emby-button', () => ({}));
vi.mock('./components/themeMediaPlayer', () => ({}));
vi.mock('./scripts/mouseManager', () => ({}));
vi.mock('./scripts/screensavermanager', () => ({}));
vi.mock('./styles/fonts.sized.scss', () => ({}));

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('__PACKAGE_JSON_NAME__', 'test');
    vi.stubGlobal('__PACKAGE_JSON_VERSION__', 'test');
    vi.stubGlobal('__COMMIT_SHA__', 'test');
    vi.stubGlobal('__JF_BUILD_VERSION__', 'test');
    document.body.innerHTML = '<div id="reactRoot">splash</div>';
    vi.spyOn(console, 'warn').mockImplementation(vi.fn());
});
afterEach(() => {
    vi.unstubAllGlobals();
});

describe('startup eager plugin failures', () => {
    it.each(['playAccessValidation/plugin', 'experimentalWarnings/plugin', 'stillWatching/plugin', 'NativePlayer'])(
        'renders and enables navigation after %s fails', async plugin => {
            mocks.getPlugins.mockResolvedValue(plugin === 'NativePlayer' ? [] : [plugin]);
            vi.stubGlobal('NativeShell', plugin === 'NativePlayer' ? { getPlugins: () => [plugin] } : undefined);
            mocks.registerPlugin.mockRejectedValue(new Error('chunk failed'));
            const entrypoint = './index.jsx';
            await import(entrypoint);
            await vi.waitFor(() => expect(mocks.render).toHaveBeenCalledOnce());
            expect(mocks.registerPlugin).toHaveBeenCalledWith(plugin);
            expect(document.getElementById('reactRoot')?.textContent).toBe('');
            expect(mocks.enableKeyboard).toHaveBeenCalledOnce();
            expect(mocks.enableFocus).toHaveBeenCalledOnce();
            expect(console.warn).toHaveBeenCalledWith('failed loading plugins', expect.any(Error));
        }
    );
});
