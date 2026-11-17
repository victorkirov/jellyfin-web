import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync('src/components/listview/listview.scss', 'utf8');
const palette = readFileSync('src/themes/_base/_palette.scss', 'utf8');

function luminance(hex: string) {
    const channels = hex.match(/[\da-f]{2}/gi)!.map(channel => {
        const value = parseInt(channel, 16) / 255;
        return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first: string, second: string) {
    const light = Math.max(luminance(first), luminance(second));
    const dark = Math.min(luminance(first), luminance(second));
    return (light + 0.05) / (dark + 0.05);
}

describe('Episode row focus', () => {
    it.each([1920, 1280])('keeps a visible inset focus border at %ipx without affecting row size', () => {
        const declaration = /\.layout-tv \.listItem-episode:focus\s*\{([^}]+)\}/.exec(styles)![1];
        const [, thickness, color] = /box-shadow:\s*inset 0 0 0 ([\d.]+)em (#[\da-f]+)/.exec(declaration)!;
        const background = /\$background-default:\s*(#[\da-f]+)/.exec(palette)![1];
        expect(contrast(color, background)).toBeGreaterThanOrEqual(3);
        // The focused fill is 12% white over the dark page, rounded to #2d2d2d.
        expect(contrast(color, '#2d2d2d')).toBeGreaterThanOrEqual(3);
        expect(Number(thickness) * 27).toBeGreaterThanOrEqual(3);
        expect(declaration).not.toMatch(/transform|transition|width|height/);
    });
});
