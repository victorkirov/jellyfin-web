import { expect, it } from 'vitest';
import { compile } from 'sass';
import postcss from 'postcss';

it('keeps wide TV controls and focused selects stationary, with an outlined primary at rest', () => {
    const css = ['src/themes/dark/theme.scss', 'src/elements/emby-button/emby-button.scss', 'src/elements/emby-select/emby-select.scss'].map(path => compile(path).css).join('\n');
    const declarations = (selector: string) => {
        const values: Record<string, string> = {};
        postcss.parse(css).walkRules(rule => {
            if (rule.selectors.includes(selector)) {
                rule.walkDecls(declaration => {
                    values[declaration.prop] = declaration.value;
                });
            }
        });
        return values;
    };
    for (const kind of ['block', 'emby-collapsible-button', 'listItem', 'listItem-border']) {
        expect(declarations(`.layout-tv .emby-button.show-focus.${kind}:focus`).transform).toBe('none');
    }
    expect(declarations('.emby-select-focusscale:focus').transform).toBeUndefined();
    expect(declarations('.emby-select-focusscale:focus')['z-index']).toBeUndefined();
    expect(declarations('.button-submit').background).not.toBe('#00a4dc');
    expect(declarations('.button-submit')['box-shadow']).toContain('#00a4dc');
    expect(declarations('.button-submit:focus').background).toContain('#00a4dc');
});
