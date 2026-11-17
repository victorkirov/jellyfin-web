import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const metadata = readFileSync('src/components/itemDetails/ItemDetailsMetadataList.tsx', 'utf8');
const controller = readFileSync('src/apps/legacy/controllers/itemDetails/index.js', 'utf8');
const theme = readFileSync('src/themes/_base/_theme.scss', 'utf8');

function luminance(channels: number[]) {
    return channels.map(channel => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

describe('Details metadata focus contrast', () => {
    it('lets the theme focus foreground win for genre, studio and person links', () => {
        expect(metadata).not.toContain("style={{ color: 'inherit' }}");
        expect(metadata).toContain("className='button-link button-link-inherit'");
        expect(theme).toContain('.button-link-inherit:not(:focus)');
        expect(theme).not.toContain('.itemDetailPage .button-link:not(:focus)');
        expect(theme).toMatch(/\.emby-button\.show-focus:focus\s*\{[^}]*primary-contrastText/);
    });

    it('also removes inline overrides from parent series, season and album links', () => {
        expect(controller).not.toContain('style="color:inherit;"');
    });

    it('limits inherited resting colours to parent, artist and metadata links', () => {
        expect(controller.match(/button-link-inherit/g)).toHaveLength(5);
        const colouredLinkLines = controller.split('\n').filter(line => (
            line.includes('itemTags') || line.includes('parsedUrl.href') || line.includes('textlink')
            || line.includes('<a href="${href}"')
        ));
        expect(colouredLinkLines.length).toBeGreaterThan(3);
        expect(colouredLinkLines.every(line => !line.includes('button-link-inherit'))).toBe(true);
    });

    it('exceeds 4.5:1 with the settled theme foreground composited over cyan', () => {
        const palette = readFileSync('src/themes/_base/_palette.scss', 'utf8');
        expect(palette).toContain('$primary-main: #00a4dc;');
        expect(palette).toContain('$primary-contrastText: rgba(0, 0, 0, 0.87);');
        const background = [0, 164, 220];
        const foreground = background.map(channel => channel * 0.13);
        expect((luminance(background) + 0.05) / (luminance(foreground) + 0.05)).toBeGreaterThanOrEqual(4.5);
    });
});
