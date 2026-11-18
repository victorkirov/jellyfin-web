import { readFileSync } from 'node:fs';
import { compile } from 'sass';
import { afterEach, expect, it } from 'vitest';

it('keeps controls in the approved rail order and preserves bottom paging on every library template', () => {
    for (const file of ['movies/movies', 'shows/tvrecommended', 'music/music']) {
        const root = document.createElement('main');
        root.innerHTML = readFileSync('src/apps/legacy/controllers/' + file + '.html', 'utf8');
        for (const rail of root.querySelectorAll('.libraryRail')) {
            const controls = Array.from(rail.children).map(element => element.classList[0]);
            const ordered = ['alphaPicker', 'btnSort', 'btnFilter-wrapper', 'btnSelectView', 'paging', 'btnPlayAll', 'btnShuffle'];
            const indices = controls.map(name => ordered.indexOf(name));
            expect(indices).toEqual([...indices].sort((left, right) => left - right));
            expect(rail.parentElement?.querySelectorAll('.paging')).toHaveLength(2);
            expect(rail.parentElement?.querySelector('.itemsContainer')?.classList.contains('focuscontainer-x')).toBe(true);
        }
    }
});

it('orders the available daily settings first and connection actions together last', () => {
    const settings = readFileSync('src/apps/legacy/routes/user/settings/index.tsx', 'utf8');
    const names = ['lnkPlaybackPreferences', 'lnkSubtitlePreferences', 'lnkDisplayPreferences', 'lnkQuickConnectPreferences', 'btnLogout'];
    const indices = names.map(name => settings.indexOf(name));
    expect(indices.every(index => index >= 0)).toBe(true);
    expect(indices).toEqual([...indices].sort((left, right) => left - right));
});

afterEach(() => {
    document.body.innerHTML = '';
    document.head.querySelectorAll('style').forEach(style => {
        style.remove();
    });
    document.documentElement.classList.remove('layout-tv');
});

it('gives small Home library buttons the approved pill dimensions and colors', () => {
    const style = document.createElement('style');
    style.textContent = compile('src/components/homesections/homesections.scss').css;
    document.head.appendChild(style);
    document.documentElement.classList.add('layout-tv');
    document.body.innerHTML = '<a class="homeLibraryButton" href="#">Movies</a>';
    const button = document.querySelector<HTMLElement>('a')!;
    expect(getComputedStyle(button).height).toBe('2.6em');
    expect(getComputedStyle(button).backgroundColor).toBe('rgb(38, 38, 38)');
    expect(getComputedStyle(button).justifyContent).toBe('flex-start');
    // jsdom does not resolve dynamic focus styles; the built-browser walk checks them.
    const rule = Array.from(style.sheet!.cssRules).find(candidate => candidate.cssText.startsWith('.layout-tv .homeLibraryButton:focus')) as CSSStyleRule;
    expect(rule.style.background).toBe('rgb(0, 164, 220)');
    expect(rule.style.color).toBe('rgb(17, 17, 17)');
});

it('keeps grid artwork margins stable when details loads the shared scroller stylesheet', () => {
    const railCss = compile('src/apps/legacy/controllers/libraryRail.scss').css;
    const scrollerCss = compile('src/elements/emby-scroller/emby-scroller.scss').css;
    const style = document.createElement('style');
    document.documentElement.classList.add('layout-tv');
    document.documentElement.dir = 'ltr';
    document.body.innerHTML = '<div class="libraryRail"></div><div class="itemsContainer"><div class="card"><div class="cardBox"></div></div></div>';
    document.head.appendChild(style);
    for (const css of [scrollerCss + railCss, railCss + scrollerCss]) {
        style.textContent = css;
        const box = document.querySelector<HTMLElement>('.cardBox')!;
        expect(getComputedStyle(box).marginLeft).toBe('0.4em');
        expect(getComputedStyle(box).marginRight).toBe('0.4em');
    }
    document.documentElement.removeAttribute('dir');
});

it('omits Jump from the series-sorted Episodes library', () => {
    const root = document.createElement('main');
    root.innerHTML = readFileSync('src/apps/legacy/controllers/shows/tvrecommended.html', 'utf8');
    expect(root.querySelector('#episodesTab .alphaPicker')).toBeNull();
});

it('keeps rail filter labels on one line with ellipsis', () => {
    const style = document.createElement('style');
    style.textContent = compile('src/components/filterdialog/filterIndicator.scss').css;
    document.head.appendChild(style);
    document.body.innerHTML = '<div class="libraryRail"><div class="btnFilterWithIndicator"><span class="filterIndicator">Filter: Science Fiction</span></div></div>';
    const label = getComputedStyle(document.querySelector('.filterIndicator')!);
    expect(label.whiteSpace).toBe('nowrap');
    expect(label.overflow).toBe('hidden');
    expect(label.textOverflow).toBe('ellipsis');
});

it('paints a solid rail backing so unfocused controls remain visible after deep scrolling', () => {
    const style = document.createElement('style');
    style.textContent = compile('src/apps/legacy/controllers/libraryRail.scss').css;
    document.head.appendChild(style);
    document.documentElement.classList.add('layout-tv');
    document.body.innerHTML = '<div class="libraryRail"></div>';
    expect(getComputedStyle(document.querySelector('.libraryRail')!).backgroundColor).toBe('rgb(16, 16, 16)');
});

it('gives each fixed rail icon button an opaque backing for its own paint context', () => {
    const style = document.createElement('style');
    style.textContent = compile('src/apps/legacy/controllers/libraryRail.scss').css;
    document.head.appendChild(style);
    document.documentElement.classList.add('layout-tv');
    document.body.innerHTML = '<div class="libraryRail"><button class="paper-icon-button-light"><span class="material-icons">sort</span><span class="libraryRailLabel">Sort</span></button></div>';
    expect(getComputedStyle(document.querySelector('button')!).backgroundColor).toBe('rgb(16, 16, 16)');
});
