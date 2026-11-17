import { beforeAll, describe, expect, it, vi } from 'vitest';
import globalize from 'lib/globalize';
import type { CardItem, CardRenderOptions } from './cardTypes';
import { getCardFooterText } from './cardCaptions';
import { getCardsHtml } from './cardBuilder';

vi.mock('scripts/browser', () => ({ default: {} }));
vi.mock('scripts/datetime', () => ({ default: {} }));
vi.mock('lib/focusManager', () => ({ default: {} }));
vi.mock('../images/imageLoader', () => ({ default: { getPrimaryImageAspectRatio: () => 1 } }));
vi.mock('../indicators/indicators', () => ({ default: { getProgressBarHtml: () => '' } }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('../router/appRouter', () => ({ appRouter: {} }));
vi.mock('../shortcuts', () => ({ default: {} }));
vi.mock('elements/emby-button/paper-icon-button-light', () => ({}));
vi.mock('lib/jellyfin-apiclient', () => ({
    ServerConnections: {
        getApiClient: () => ({ serverId: () => 'server' }),
        getApi: () => undefined
    }
}));

beforeAll(async () => {
    globalize.defaultModule('card-caption-compatibility');
    await globalize.loadStrings({
        name: 'card-caption-compatibility',
        strings: [{ lang: 'en-us', path: 'en-us.json' }]
    });
});

function footer(item: CardItem, options: CardRenderOptions = {}) {
    return getCardFooterText({
        item, options, footerClass: 'caption', progressHtml: '', forceName: false,
        overlayText: options.overlayText, isOuterFooter: !options.overlayText
    });
}

describe('legacy nullable card caption inputs', () => {
    it.each([undefined, null])('keeps a blank normal title when Name is %s', Name => {
        expect(footer({ Type: 'Movie', Name }, { showTitle: true }))
            .toBe("<div class='cardText'>&nbsp;</div>");
    });

    it.each([undefined, null])('preserves overlay title string coercion when Name is %s', Name => {
        expect(footer({ Type: 'Movie', Name }, { showTitle: true, overlayText: true }))
            .toBe(`<div class="caption"><div class='cardText'><bdi>${String(Name)}</bdi></div></div>`);
    });

    it.each([undefined, null])('preserves the null rating group when CommunityRating is %s', CommunityRating => {
        const html = getCardsHtml([{ Id: 'movie', ServerId: 'server', Type: 'Movie', CommunityRating }], {
            shape: 'square', width: 200, disableIndicators: true, indexBy: 'CommunityRating'
        });
        const container = document.createElement('div');
        container.innerHTML = html;
        expect(container.querySelector('.sectionTitle')?.textContent).toBe('null');
        expect(container.querySelector('.card')?.getAttribute('aria-label')).toBe('undefined');
    });

    it('skips person-role translation when the item has no type', () => {
        expect(footer({ Name: 'Untyped person' }, { showPersonRoleOrType: true })).toBe('');
        expect(footer({ Type: 'Writer' }, { showPersonRoleOrType: true }))
            .toBe("<div class='cardText cardText-first'><bdi>Writer</bdi></div>");
    });

    it.each([undefined, null])('preserves localization rejection when a Series count is %s', RecursiveItemCount => {
        expect(() => footer({ Type: 'Series', RecursiveItemCount }, { showItemCounts: true })).toThrow(TypeError);
    });

    it.each([[0, '0 episodes'], [1, '1 episode'], [2, '2 episodes']] as const)('localizes a Series count of %s', (RecursiveItemCount, text) => {
        expect(footer({ Type: 'Series', RecursiveItemCount }, { showItemCounts: true }))
            .toBe(`<div class='cardText cardText-first'><bdi>${text}</bdi></div>`);
    });
});
