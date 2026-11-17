import { describe, expect, it, vi } from 'vitest';
import { getCardsHtml } from './cardBuilder';

vi.mock('scripts/browser', () => ({ default: {} }));
vi.mock('scripts/datetime', () => ({ default: {} }));
vi.mock('lib/globalize', async () => {
    const { default: translations } = await import('../../strings/de.json');
    return {
        default: {
            translate: (key: keyof typeof translations) => translations[key] || key
        }
    };
});
vi.mock('lib/jellyfin-apiclient', () => ({
    ServerConnections: {
        getApiClient: () => ({ serverId: () => 'server' }),
        getApi: () => undefined
    }
}));
vi.mock('../focusManager', () => ({ default: {} }));
vi.mock('../images/imageLoader', () => ({
    default: { getPrimaryImageAspectRatio: () => 1 }
}));
vi.mock('../indicators/indicators', () => ({
    default: { getProgressBarHtml: () => '' }
}));
vi.mock('../itemHelper', () => ({
    default: { getDisplayName: (item: { Name: string }) => item.Name }
}));
vi.mock('../layoutManager', () => ({ default: { tv: true } }));
vi.mock('../playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('../router/appRouter', () => ({ appRouter: {} }));
vi.mock('../shortcuts', () => ({ default: {} }));
vi.mock('elements/emby-button/paper-icon-button-light', () => ({}));

describe('card person roles', () => {
    it('renders translatable free-text crew roles in the UI language', () => {
        const html = getCardsHtml([{
            Id: 'writer',
            ServerId: 'server',
            Name: 'Writer name',
            Type: 'Writer',
            Role: 'Screenplay'
        }], {
            shape: 'square',
            width: 200,
            disableIndicators: true,
            showPersonRoleOrType: true
        });

        const container = document.createElement('div');
        container.innerHTML = html;
        expect(container.querySelector('.cardText-first')?.textContent).toBe('Drehbuch');
    });
});
