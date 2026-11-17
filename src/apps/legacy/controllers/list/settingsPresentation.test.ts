import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ItemDto } from 'types/base/models/item-dto';
import type { CardOptions } from 'types/cardOptions';
import type { ListParams } from './types';
import { ListSettings } from './settings';
import { getItemsHtml } from './presentation';
import { getCardFooterText } from 'components/cardbuilder/cardCaptions';
import * as userSettings from 'scripts/settings/userSettings';

const { renderCards } = vi.hoisted(() => ({
    renderCards: vi.fn<(options: CardOptions & { items: ItemDto[] }) => string>()
}));
vi.mock('scripts/settings/userSettings', () => ({
    get: vi.fn<(key: string) => string | null | undefined>(),
    getSortValuesLegacy: vi.fn(() => ({ sortBy: 'SortName', sortOrder: 'Ascending' })),
    useEpisodeImagesInNextUpAndResume: vi.fn(() => false)
}));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: { getCardsHtml: renderCards } }));
vi.mock('components/listview/listview', () => ({ default: {} }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('scripts/datetime', () => ({ default: { toLocaleString: (value: number) => String(value) } }));
vi.mock('components/itemHelper', () => ({ default: { getDisplayName: (item: ItemDto) => item.Name } }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('components/router/appRouter', () => ({ appRouter: {} }));
vi.mock('components/shortcuts', () => ({ default: {} }));

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(userSettings.get).mockReturnValue(undefined);
    renderCards.mockImplementation(options => options.items.map(item => getCardFooterText({
        item, options, footerClass: 'cardFooter', progressHtml: '',
        forceName: false, isOuterFooter: true, overlayText: options.overlayText, imgUrl: 'poster.jpg'
    })).join(''));
});

function setup(saved: string | null | undefined, params: ListParams = { serverId: 'server', type: 'Movie' }, item: ItemDto | null = null) {
    vi.mocked(userSettings.get).mockImplementation(key => key.endsWith('-showTitle') ? saved : undefined);
    const settings = new ListSettings(params);
    settings.currentItem = item;
    return settings;
}

// a7291f0fa list.js getViewSettings parses only true/false before applying type/context defaults.
const rawCases: { saved: string | null | undefined; expected: boolean | string | null | undefined; visible: boolean }[] = [
    { saved: 'true', expected: true, visible: true },
    { saved: 'false', expected: false, visible: false },
    { saved: undefined, expected: undefined, visible: false },
    { saved: null, expected: null, visible: false },
    { saved: '', expected: '', visible: false },
    { saved: 'auto', expected: 'auto', visible: true },
    { saved: 'unexpected', expected: 'unexpected', visible: true }
];

describe('Legacy list title settings', () => {
    it.each(rawCases)('preserves saved $saved as $expected without a type/context default', ({ saved, expected }) => {
        expect(setup(saved).getViewSettings().showTitle).toBe(expected);
    });

    it.each(['Audio', 'MusicAlbum', 'MusicArtist', 'Person', 'Programs', 'Recordings', 'nextup', 'tag'])('keeps the historical %s default and explicit false override', type => {
        for (const saved of [undefined, null, '', 'auto', 'unexpected']) {
            expect(setup(saved, { serverId: 'server', type }).getViewSettings().showTitle).toBe(true);
        }
        expect(setup('false', { serverId: 'server', type }).getViewSettings().showTitle).toBe(false);
    });

    it.each(rawCases)('keeps raw $saved for photo-album context but defaults other item contexts', ({ saved, expected }) => {
        expect(setup(saved, { serverId: 'server' }, { Type: 'PhotoAlbum' }).getViewSettings().showTitle).toBe(expected);
        const contextual = expected !== false;
        expect(setup(saved, { serverId: 'server' }, { Type: 'Folder' }).getViewSettings().showTitle).toBe(contextual);
    });
});

describe('List settings to card captions', () => {
    const movie: ItemDto = { Id: 'movie', Type: 'Movie', Name: 'Saved title', ProductionYear: 2020 };

    it.each(rawCases)('retains the caption behavior of saved $saved', ({ saved, expected, visible }) => {
        const settings = setup(saved);
        const html = getItemsHtml(settings, settings.params, [movie]);
        expect(html).toMatchSnapshot();
        const options = renderCards.mock.calls[0][0];
        expect(options.showTitle ?? undefined).toBe(expected ?? undefined);
        expect(options.showYear ?? undefined).toBe(expected ?? undefined);
        expect(options.showParentTitle).toBe(Boolean(expected));
        expect(options.overlayText).toBe(!expected);
        expect(options.lines).toBe(visible ? 2 : 0);
        expect(html.includes('Saved title')).toBe(visible);
        expect(html.includes('2020')).toBe(visible);
    });

    it.each([
        { saved: 'false', enabled: false, lines: 0 },
        { saved: 'auto', enabled: true, lines: 3 }
    ])('keeps derived program flags boolean for $saved', ({ saved, enabled, lines }) => {
        const settings = setup(saved, { serverId: 'server', type: 'Programs', IsMovie: 'false' });
        getItemsHtml(settings, settings.params, [{ ...movie, Type: 'Program' }]);
        expect(renderCards.mock.calls[0][0]).toMatchObject({
            showTitle: enabled, showParentTitle: enabled, showAirTime: enabled,
            showAirDateTime: enabled, showYear: false, lines
        });
    });

    it('keeps auto distinct from unknown truthy strings for photo captions', () => {
        const photo: ItemDto = { Id: 'photo', Type: 'Photo', MediaType: 'Photo', Name: 'Photo title', IsFolder: false };
        const automatic = setup('auto');
        const autoHtml = getItemsHtml(automatic, automatic.params, [photo]);
        expect(renderCards.mock.calls[0][0].showTitle).toBe('auto');
        expect(autoHtml).not.toContain('Photo title');
        const unexpected = setup('unexpected');
        const unexpectedHtml = getItemsHtml(unexpected, unexpected.params, [photo]);
        expect(renderCards.mock.calls[1][0].showTitle).toBe('unexpected');
        expect(unexpectedHtml).toContain('Photo title');
    });

    it('keeps explicit false disabled for a default-on next-up caller', () => {
        const settings = setup('false', { serverId: 'server', type: 'nextup' });
        const html = getItemsHtml(settings, settings.params, [{ ...movie, Type: 'Episode', SeriesName: 'Series title' }]);
        const options = renderCards.mock.calls[0][0];
        expect(options).toMatchObject({ showTitle: false, showYear: false, showParentTitle: false, overlayText: true, lines: 0 });
        expect(html).not.toContain('Saved title');
        expect(html).not.toContain('Series title');
    });
});
