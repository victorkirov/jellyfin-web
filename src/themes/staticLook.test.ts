import { beforeAll, expect, it } from 'vitest';
import { compile } from 'sass';
import postcss from 'postcss';

let css: string;
beforeAll(() => {
    css = [
        'src/themes/dark/theme.scss',
        'src/elements/emby-button/emby-button.scss',
        'src/elements/emby-tabs/emby-tabs.scss',
        'src/elements/emby-radio/emby-radio.scss',
        'src/elements/emby-checkbox/emby-checkbox.scss',
        'src/elements/emby-slider/emby-slider.scss',
        'src/styles/fonts.sized.scss',
        'src/styles/librarybrowser.scss',
        'src/components/cardbuilder/card.scss'
    ].map(path => compile(path).css).join('\n');
});

function declarations(selector: string) {
    const result: Record<string, string> = {};
    postcss.parse(css).walkRules(rule => {
        if (rule.selectors.includes(selector)) {
            rule.walkDecls(decl => {
                result[decl.prop] = decl.value;
            });
        }
    });
    return result;
}

it('fills icon and tab focus without enlarging either box, and reserves an active-tab mark', () => {
    for (const selector of ['.paper-icon-button-light.show-focus:focus', '.emby-tab-button.show-focus:focus']) {
        const style = declarations(selector);
        expect(style.background).toBe('#00a4dc');
        expect(style.color).toBe('rgba(0, 0, 0, 0.87)');
        expect(style.transform).toBe('none');
    }
    expect(declarations('.emby-tab-button')['border-bottom']).toBe('0.15em solid transparent');
    expect(declarations('.emby-tab-button-active')['border-bottom-color']).toBe('currentColor');
});

it('reserves row borders and keeps selection styling independent of row focus', () => {
    for (const selector of ['.mdl-radio', '.emby-checkbox-label']) {
        expect(declarations(selector)['border-left']).toBe('0.15em solid transparent');
        const focus = declarations(selector + '.input-focused');
        expect(focus.background).toBe('rgba(255, 255, 255, 0.12)');
        expect(focus['border-left-color']).toBe('#00a4dc');
    }
    expect(declarations('.emby-checkbox-label')['padding-left']).toBe('0.5em');
    expect(declarations('.checkboxOutline').left).toBe('0.5em');
    expect(declarations('.mdl-radio__button:checked + .mdl-radio__circles .mdl-radio__inner-circle').transform).toBe('scale(1)');
    expect(declarations('.emby-checkbox:checked + span + .checkboxOutline > .checkboxIcon-checked').display).toBe('flex');
});

it('makes slider focus visible with a static thumb ring', () => {
    expect(declarations('.mdl-slider.show-focus:focus::-webkit-slider-thumb')['box-shadow']).toBe('0 0 0 0.15em #fff');
});

it('separates heading hierarchy from muted metadata', () => {
    for (const selector of ['h1.itemName', '.formDialogHeaderTitle', '.dialogContentTitle', '.dialog h2', 'h2.sectionTitle']) {
        expect(declarations(selector).color).toBe('#fff');
        expect(declarations(selector)['font-weight']).toBe('600');
    }
    expect(declarations('h1.itemName')['font-size']).toBe('1.8em');
    expect(declarations('.itemName')['font-size']).toBeUndefined();
    expect(declarations('h3')['font-size']).toBe('1.17em');
    expect(declarations('h3')['font-weight']).toBe('400');
    expect(declarations('h2.sectionTitle')['font-size']).toBe('1.3em');
});

it('keeps two-line caption capacity without reserving a blank title line above metadata', () => {
    expect(declarations('.itemsContainer > button.card').display).toBe('flex');
    expect(declarations('.itemsContainer > button.card')['flex-direction']).toBe('column');
    const title = declarations('.cardText-first > bdi');
    expect(title['-webkit-line-clamp']).toBe('2');
    expect(title['max-height']).toBe('2.5em');
    expect(title['min-height']).toBeUndefined();
    expect(declarations('.cardText-first')['line-height']).toBe('1.25');
    expect(declarations('.cardText-first + .cardText')['margin-top']).toBe('0.2em');
    expect(declarations('.cardTextCentered')['text-align']).toBe('left');
});

it('aligns header container boxes with the content inset', () => {
    expect(declarations('.headerTop').padding).toBe('0.8em 3.3%');
    expect(declarations('.headerLeft > .headerButton')['margin-left']).toBe('0');
});
