import { afterEach, expect, it } from 'vitest';
import { compile } from 'sass';

const css = compile('src/apps/legacy/controllers/libraryRail.scss').css;
afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
});

it('keeps disabled paging focus outlined and dim while enabled focus is solid', () => {
    document.head.innerHTML = `<style>${css}</style>`;
    document.body.innerHTML = '<div class="layout-tv"><div class="libraryRail"><button aria-disabled="true">Previous</button><button>Next</button></div></div>';
    const buttons = document.querySelectorAll('button');
    buttons[0].focus();
    const disabled = getComputedStyle(buttons[0]);
    expect(disabled.backgroundColor).not.toBe('rgb(0, 164, 220)');
    expect(disabled.boxShadow).toContain('#00a4dc');
    expect(disabled.color).toBe('rgba(255, 255, 255, 0.35)');
    buttons[1].focus();
    expect(getComputedStyle(buttons[1]).backgroundColor).toBe('rgb(0, 164, 220)');
});
