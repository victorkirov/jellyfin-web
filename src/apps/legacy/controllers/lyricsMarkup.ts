import type { LyricLine } from '@jellyfin/sdk/lib/generated-client/models/lyric-line';
import escapeHtml from 'escape-html';
import layoutManager from 'lib/layoutManager';

export function getLyricsHtml(lyrics: LyricLine[], isDynamicLyric: boolean) {
    function lyricHtmlReducer(htmlAccumulator: string, lyric: LyricLine, index: number) {
        const elem = layoutManager.tv ? 'button' : 'div';
        const classes = [];
        if (isDynamicLyric) classes.push('dynamicLyric');
        if (layoutManager.tv) classes.push('listItem', 'show-focus');
        const lyricTime = typeof lyric.Start !== 'undefined' ? `data-lyrictime="${lyric.Start}"` : '';

        htmlAccumulator += `<${elem} class="lyricsLine ${classes.join(' ')}" id="lyricPosition${index}" ${lyricTime}>
    ${escapeHtml(lyric.Text!)}
</${elem}>`;

        return htmlAccumulator;
    }
    return lyrics.reduce(lyricHtmlReducer, '');
}
