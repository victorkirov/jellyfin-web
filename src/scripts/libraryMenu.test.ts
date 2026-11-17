import { afterEach, expect, it, vi } from 'vitest';
const { handlers, server } = vi.hoisted(() => ({
    handlers: new Map<string, (event: Event, data: { ServerId: string }) => void>(),
    server: { getApiClient: vi.fn(), currentApiClient: vi.fn(), user: vi.fn().mockResolvedValue({ name: 'Viewer', localUser: { ServerId: 'server' } }) }
}));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: server }));
vi.mock('./inputManager', () => ({ default: { handleCommand: vi.fn() } }));
vi.mock('../components/viewManager/viewManager', () => ({ default: {} }));
vi.mock('../components/router/appRouter', () => ({ appRouter: {} }));
vi.mock('../components/playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('./browser', () => ({ default: {} }));
vi.mock('../components/dashboard', () => ({ default: {}, pageClassOn: vi.fn() }));
vi.mock('../utils/events.ts', () => ({ default: { trigger: vi.fn(), on: (_target: unknown, name: string, handler: (event: Event, data: { ServerId: string }) => void) => {
    handlers.set(name, handler);
} } }));
vi.mock('../elements/emby-button/paper-icon-button-light', () => ({}));
vi.mock('../components/images/imageLoader', () => ({ lazyChildren: vi.fn() }));
vi.mock('./datetime', () => ({ default: { getDisplayTime: () => '12:00' } }));
afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
});

it('renders named header controls, updates the user and preserves title APIs', async () => {
    vi.useFakeTimers();
    server.user.mockResolvedValue({ name: 'Viewer', localUser: { ServerId: 'server' } });
    document.body.innerHTML = '<div class="skinHeader"></div>';
    const { default: menu } = await import('./libraryMenu');
    expect(document.querySelector('.headerSearchButton')?.getAttribute('title')).toBe('Search');
    expect(document.querySelector('.headerUserButton')?.getAttribute('title')).toBe('Settings');
    handlers.get('localusersignedin')!(new Event('localusersignedin'), { ServerId: 'server' });
    await Promise.resolve();
    expect(document.querySelector('.headerUserButton')?.getAttribute('title')).toBe('Viewer');
    expect(document.querySelector('.headerHomeButton')?.classList.contains('hide')).toBe(false);
    menu.setTitle('Movies');
    expect(document.querySelector<HTMLElement>('.pageTitle')?.innerText).toBe('Movies');
    menu.setDefaultTitle();
    expect(document.querySelector('.pageTitle')?.classList.contains('pageTitleWithDefaultLogo')).toBe(true);
});
