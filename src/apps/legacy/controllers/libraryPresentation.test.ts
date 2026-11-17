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
