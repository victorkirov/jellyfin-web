import { afterEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'sass';
import { getCardFooterText } from './cardCaptions';
import { buildCards, getCardsHtml, onUserDataChanged, onTimerCreated, onTimerCancelled, onSeriesTimerCancelled } from './cardBuilder';

vi.mock('scripts/browser', () => ({ default: {} }));
vi.mock('scripts/datetime', () => ({ default: { toLocaleString: (value: number) => String(value) } }));
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
vi.mock('../../lib/focusManager', () => ({ default: {} }));
vi.mock('../images/imageLoader', () => ({
    default: { getPrimaryImageAspectRatio: () => 1, lazyChildren: vi.fn() }
}));
vi.mock('../indicators/indicators', () => ({
    default: { getProgressBarHtml: () => '' }
}));
vi.mock('../itemHelper', () => ({
    default: { getDisplayName: (item: { Name: string }) => item.Name }
}));
vi.mock('../../lib/layoutManager', () => ({ default: { tv: true } }));
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

afterEach(() => {
    document.head.querySelectorAll('style').forEach(style => {
        style.remove();
    });
    document.body.innerHTML = '';
    document.body.removeAttribute('dir');
});

describe('TV card title captions', () => {
    it.each(['ltr', 'rtl'])('preserves two-line title capacity through rapid focus changes (%s)', direction => {
        const style = document.createElement('style');
        style.textContent = compile('src/components/cardbuilder/card.scss').css;
        document.head.appendChild(style);
        document.body.dir = direction;
        document.body.innerHTML = getCardsHtml(['Short', 'All Creatures Great and Small with a very long series title'].map((Name, index) => ({
            Id: String(index), ServerId: 'server', Name, Type: 'Series'
        })), { shape: 'square', width: 200, disableIndicators: true, showTitle: true });
        const titles = Array.from(document.querySelectorAll<HTMLElement>('.cardText-first > bdi'));
        expect(titles).toHaveLength(2);
        const bounds = titles.map(title => {
            const computed = getComputedStyle(title);
            expect(computed.whiteSpace).toBe('normal');
            expect(computed.overflow).toBe('hidden');
            expect(computed.getPropertyValue('-webkit-line-clamp')).toBe('2');
            expect(computed.minHeight).not.toBe('2.5em');
            expect(computed.maxHeight).toBe('2.5em');
            return computed.minHeight;
        });
        const cards = Array.from(document.querySelectorAll<HTMLElement>('.card'));
        [0, 1, 0, 1].forEach(index => {
            cards[index].focus();
            expect(document.activeElement).toBe(cards[index]);
            expect(titles.map(title => getComputedStyle(title).minHeight)).toEqual(bounds);
        });
    });

    it('wraps the episode title below its series without expanding metadata', () => {
        const style = document.createElement('style');
        style.textContent = compile('src/components/cardbuilder/card.scss').css;
        document.head.appendChild(style);
        document.body.innerHTML = getCardsHtml([{
            Id: 'episode', ServerId: 'server', Name: 'Curious George Discovers the Wonderful World of Science',
            Type: 'Episode', SeriesName: 'Curious George', ProductionYear: 2000
        }], { shape: 'square', width: 200, disableIndicators: true, showTitle: true, showParentTitle: true, showYear: true });
        const captions = document.querySelectorAll('.cardText > bdi');
        expect(captions).toHaveLength(3);
        expect(getComputedStyle(captions[0]).minHeight).not.toBe('2.5em');
        expect(getComputedStyle(captions[1]).minHeight).toBe('2.5em');
        expect(getComputedStyle(captions[2]).minHeight).not.toBe('2.5em');
        expect(captions[1].textContent).toContain('Curious George Discovers');
    });
});

it('keeps mixed Continue Watching caption slots equal without clamping years', () => {
    const style = document.createElement('style');
    style.textContent = compile('src/components/cardbuilder/card.scss').css;
    document.head.appendChild(style);
    document.body.innerHTML = getCardsHtml([
        { Id: 'movie', ServerId: 'server', Name: 'A long movie title', Type: 'Movie', ProductionYear: 2000 },
        { Id: 'episode', ServerId: 'server', Name: 'A long episode title', Type: 'Episode', SeriesName: 'Series', ProductionYear: 2000 },
        { Id: 'undated', ServerId: 'server', Name: 'A movie without a year', Type: 'Movie' }
    ], { shape: 'square', width: 200, disableIndicators: true, showTitle: true, showParentTitle: true, showYear: true, lines: 2 });
    const cards = Array.from(document.querySelectorAll('.card'));
    expect(document.querySelectorAll('.card-tallSecondary')).toHaveLength(3);
    const slots = cards.map(card => getComputedStyle(card.querySelector('.cardText-first + .cardText')!));
    expect(slots.map(slot => slot.minHeight)).toEqual(['2.5em', '2.5em', '2.5em']);
    expect(slots.map(slot => slot.lineHeight)).toEqual(['1.25', '1.25', '1.25']);
    expect(slots.map(slot => slot.fontSize)).toEqual(['86%', '86%', '86%']);
    const year = cards[0].querySelector('.cardText-secondary > bdi')!;
    expect(year.textContent).toBe('2000');
    expect(getComputedStyle(year).minHeight).not.toBe('2.5em');
    expect(getComputedStyle(year).getPropertyValue('-webkit-line-clamp')).not.toBe('2');
    expect(getComputedStyle(cards[1].querySelector('.cardText-secondary > bdi')!).minHeight).toBe('2.5em');
});

it('allows a dotted filename-like title to break within its two-line caption', () => {
    const style = document.createElement('style');
    style.textContent = compile('src/components/cardbuilder/card.scss').css;
    document.head.appendChild(style);
    const name = 'All.Creatures.Great.And.Small.S01E01.1080p.BluRay.x264.VeryLongReleaseName';
    document.body.innerHTML = getCardsHtml([{ Id: 'movie', ServerId: 'server', Name: name, Type: 'Movie' }], {
        shape: 'square', width: 200, disableIndicators: true, showTitle: true
    });
    const title = document.querySelector('.cardText-first > bdi')!;
    expect(title.textContent).toBe(name);
    const computed = getComputedStyle(title);
    expect(computed.getPropertyValue('word-wrap')).toBe('break-word');
    expect(computed.getPropertyValue('-webkit-line-clamp')).toBe('2');
    expect(computed.maxHeight).toBe('2.5em');
});

it('keeps movie-only year slots compact after rendering a mixed batch with the same options', () => {
    const style = document.createElement('style');
    style.textContent = compile('src/components/cardbuilder/card.scss').css;
    document.head.appendChild(style);
    const options = { shape: 'square', width: 200, disableIndicators: true, showTitle: true, showParentTitle: true, showYear: true, lines: 2 };
    const movies = [
        { Id: 'movie', ServerId: 'server', Name: 'Movie', Type: 'Movie', ProductionYear: 2000 },
        { Id: 'other', ServerId: 'server', Name: 'Another movie', Type: 'Movie', ProductionYear: 2001 }
    ];
    const episode = { Id: 'episode', ServerId: 'server', Name: 'Episode', Type: 'Episode', SeriesName: 'Series' };
    document.body.innerHTML = getCardsHtml(movies, options);
    expect(getComputedStyle(document.querySelector('.cardText-first + .cardText')!).minHeight).toBe('1.25em');
    document.body.innerHTML = getCardsHtml([movies[0], episode], options);
    expect(document.querySelectorAll('.card-tallSecondary')).toHaveLength(2);
    document.body.innerHTML = getCardsHtml(movies, options);
    expect(document.querySelector('.card-tallSecondary')).toBeNull();
    const years = Array.from(document.querySelectorAll('.cardText-first + .cardText'));
    expect(years).toHaveLength(2);
    years.forEach(year => {
        const computed = getComputedStyle(year);
        expect(computed.minHeight).toBe('1.25em');
        expect(computed.maxHeight).not.toBe('2.5em');
        expect(computed.lineHeight).toBe('1.25');
    });
});

describe('card markup characterisation', () => {
    const items = [
        { Id: 'movie', ServerId: 'server', Name: '<Movie & title>', Type: 'Movie', ProductionYear: 2000 },
        { Id: 'episode', ServerId: 'server', Name: 'An episode', Type: 'Episode', SeriesName: 'Series & name', SeriesId: 'series' },
        { Id: 'photo', ServerId: 'server', Name: 'Photo', Type: 'Photo', MediaType: 'Photo' },
        { Id: 'album', ServerId: 'server', Name: 'Album', Type: 'MusicAlbum', AlbumArtist: 'Artist' }
    ];
    it.each([
        { showTitle: true, showParentTitle: true, showYear: true, lines: 2 },
        { showTitle: false, showParentTitleOrTitle: true, overlayText: false },
        { showTitle: 'auto', overlayText: true },
        { showTitle: false, overlayText: true },
        { showTitle: true, cardLayout: true, textLines: () => ['<em>custom</em>', ''] }
    ])('preserves exact caption and card markup for %j', options => {
        const html = getCardsHtml(items, { shape: 'square', width: 200, disableIndicators: true, ...options });
        expect(html).toMatchSnapshot();
    });
});

describe('card indicator updates', () => {
    it('updates played and unplayed indicators through the public facade', () => {
        document.body.innerHTML = getCardsHtml([{
            Id: 'series', ServerId: 'server', Name: 'Series', Type: 'Series'
        }], { shape: 'square', width: 200, disableIndicators: true });
        onUserDataChanged({ Key: 'series', ItemId: 'series', Played: true, UnplayedItemCount: 3 });
        const card = document.querySelector('.card')!;
        expect(card.querySelector('.playedIndicator')).not.toBeNull();
        expect(card.querySelector('.countIndicator')?.textContent).toBe('3');
        expect(card.querySelectorAll('.cardIndicators')).toHaveLength(1);
        onUserDataChanged({ Key: 'series', ItemId: 'series', Played: false, UnplayedItemCount: 0 });
        expect(card.querySelector('.playedIndicator')).toBeNull();
        expect(card.querySelector('.countIndicator')).toBeNull();
    });

    it('creates and removes recording indicators without duplicate DOM', () => {
        document.body.innerHTML = '<button class="card" data-id="program" data-seriestimerid="series"><div class="cardImageContainer"></div></button>';
        onTimerCreated('program', 'timer', document.body);
        onTimerCreated('program', 'timer', document.body);
        expect(document.querySelectorAll('.timerIndicator')).toHaveLength(1);
        onTimerCancelled('timer', document.body);
        expect(document.querySelector('.timerIndicator')).toBeNull();
        expect(document.querySelector('[data-timerid]')).toBeNull();
        onTimerCreated('program', 'second-timer', document.body);
        onSeriesTimerCancelled('series', document.body);
        expect(document.querySelector('.timerIndicator')).toBeNull();
        expect(document.querySelector('[data-seriestimerid]')).toBeNull();
    });
});

describe('named footer context', () => {
    it('keeps title escaping and optional callback lines separate from markup', () => {
        expect(getCardFooterText({
            item: { Id: 'movie', Type: 'Movie', Name: '<Movie & title>' },
            options: { showTitle: true, overlayText: false, textLines: () => ['<em>custom</em>'], lines: 2 },
            footerClass: 'cardFooter', progressHtml: '', forceName: false,
            overlayText: false, isOuterFooter: true
        })).toBe("<div class='cardText cardText-first'><bdi>&lt;Movie &amp; title&gt;</bdi></div><div class='cardText cardText-secondary'><bdi><em>custom</em></bdi></div>");
    });

    it('preserves explicit false and null options for an empty caption', () => {
        expect(getCardFooterText({
            item: { Id: 'movie', Type: 'Movie', Name: 'Movie' },
            options: { showTitle: false, overlayText: false, cardLayout: null, preferThumb: null },
            footerClass: 'cardFooter', progressHtml: '', forceName: false,
            overlayText: false, isOuterFooter: true
        })).toBe('');
    });
});

describe('shared focused card caption', () => {
    const title = 'Curious George: A Very Monkey Christmas <full & untruncated>';
    const options = { shape: 'square', width: 200, disableIndicators: true, showTitle: true };

    it('uses one static caption for the focused card without changing neighbouring markup', () => {
        document.body.innerHTML = getCardsHtml([
            { Id: 'long', Name: title, Type: 'Movie' },
            { Id: 'other', Name: 'Another title', Type: 'Movie' }
        ], options);
        const cards = document.querySelectorAll<HTMLButtonElement>('.card');
        const neighbours = Array.from(cards).map(card => card.outerHTML);
        cards[0].focus();
        const caption = document.querySelector('.focusedCardCaption');
        expect(caption?.textContent).toBe(title);
        expect(caption?.querySelector('full')).toBeNull();
        cards[1].focus();
        expect(document.querySelectorAll('.focusedCardCaption')).toHaveLength(1);
        expect(document.querySelector('.focusedCardCaption')).toBe(caption);
        expect(caption?.textContent).toBe('Another title');
        expect(Array.from(cards).map(card => card.outerHTML)).toEqual(neighbours);
        expect(caption?.getAttribute('aria-hidden')).toBe('true');
    });

    it('clears the caption on other focus and when its page hides', () => {
        document.body.innerHTML = '<div class="page">' + getCardsHtml([{ Id: 'long', Name: title, Type: 'Movie' }], options) + '</div><input />';
        document.querySelector<HTMLButtonElement>('.card')!.focus();
        document.querySelector<HTMLInputElement>('input')!.focus();
        expect(document.querySelector('.focusedCardCaption')?.textContent).toBe('');
        document.querySelector<HTMLButtonElement>('.card')!.focus();
        document.querySelector('.page')!.dispatchEvent(new Event('viewbeforehide', { bubbles: true }));
        expect(document.querySelector('.focusedCardCaption')?.textContent).toBe('');
    });

    it('clears a removed card caption when the card builder refreshes the container', () => {
        document.body.innerHTML = '<div class="itemsContainer"></div>';
        const itemsContainer = document.querySelector<HTMLElement>('.itemsContainer')!;
        buildCards([{ Id: 'long', Name: title, Type: 'Movie' }], { ...options, itemsContainer });
        itemsContainer.querySelector<HTMLButtonElement>('.card')!.focus();
        buildCards([{ Id: 'new', Name: 'Replacement', Type: 'Movie' }], { ...options, itemsContainer });
        expect(document.querySelector('.focusedCardCaption')?.textContent).toBe('');
    });
});

it('keeps the restored card caption when the outgoing page finishes hiding', () => {
    document.body.innerHTML = '<div class="outgoingPage"></div><div class="restoredPage">' + getCardsHtml([
        { Id: 'restored', Name: 'A restored title that remains fully visible', Type: 'Movie' }
    ], { shape: 'square', width: 200, disableIndicators: true, showTitle: true }) + '</div>';
    document.querySelector<HTMLButtonElement>('.card')!.focus();
    document.querySelector('.outgoingPage')!.dispatchEvent(new Event('pagehide', { bubbles: true }));
    expect(document.querySelector('.focusedCardCaption')?.textContent).toBe('A restored title that remains fully visible');
});
