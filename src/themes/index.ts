import { createTheme, type Theme } from '@mui/material/styles';

import { DEFAULT_THEME_OPTIONS } from './_base/theme';
import appletv from './appletv';
import blueradiance from './blueradiance';
import dark from './dark';
import light from './light';
import purplehaze from './purplehaze';
import wmc from './wmc';

const COLOR_SCHEMES = {
    appletv,
    blueradiance,
    dark,
    light,
    purplehaze,
    wmc
};

type ColorSchemeId = keyof typeof COLOR_SCHEMES;

const FALLBACK_COLOR_SCHEME: ColorSchemeId = 'dark';

const themes = new Map<ColorSchemeId, Theme>();

/**
 * Returns the theme for a single color scheme.
 * Themes are created on demand because creating every color scheme up front is slow on low-end TVs.
 */
export function getTheme(colorScheme?: string) {
    const id = colorScheme && colorScheme in COLOR_SCHEMES ?
        colorScheme as ColorSchemeId :
        FALLBACK_COLOR_SCHEME;

    let theme = themes.get(id);
    if (!theme) {
        theme = createTheme({
            cssVariables: {
                cssVarPrefix: 'jf',
                colorSchemeSelector: '[data-theme="%s"]',
                disableCssColorScheme: true
            },
            defaultColorScheme: id,
            ...DEFAULT_THEME_OPTIONS,
            // MUI's types expect every custom scheme, but it only generates the schemes it is given
            colorSchemes: {
                [id]: COLOR_SCHEMES[id]
            } as typeof COLOR_SCHEMES
        });
        themes.set(id, theme);
    }

    return theme;
}
