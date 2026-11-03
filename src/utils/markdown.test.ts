import markdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';

import { renderMarkdown } from './markdown';

// Reference renderer with the same options as the app, only used to compare output
// eslint-disable-next-line sonarjs/disabled-auto-escaping
const markdown = markdownIt({ html: true });

const SAMPLES = [
    '',
    'George goes to the park.',
    'A well-known chef (and his "secret" recipe) wins 1st prize in 2024.',
    'It\'s a café story: déjà vu, über-cool, 東京 and emoji 🐒.',
    'Prices rose 50% - again; who knew?',
    'Ends with a period.',
    '1990s nostalgia',
    '3 friends, 2 dogs',
    'Line one\nLine two',
    'First paragraph\n\nSecond paragraph',
    '*emphasis* and **strong**',
    'Some `code` here',
    'A [link](https://example.com)',
    '<b>html</b> text',
    'AT&T and &copy; entities',
    '# Heading',
    '- list item',
    '+ list item',
    '1. ordered',
    '2) ordered',
    '> quote',
    '  leading spaces',
    'trailing spaces  ',
    'Tab\tinside',
    'Under_score and ~tilde~',
    'Escaped \\* star',
    'Pipe | table',
    'Bang! wow',
    '=== not a heading',
    'Null \0 char'
];

describe('renderMarkdown', () => {
    it.each(SAMPLES)('matches markdown-it for %j', (text) => {
        expect(renderMarkdown(text)).toBe(markdown.render(text));
    });
});
