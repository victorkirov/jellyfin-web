import markdownIt from 'markdown-it';

let instance: ReturnType<typeof markdownIt> | undefined;

/**
 * Matches text that markdown-it could render as more than a single plain paragraph:
 * line breaks, markdown or HTML syntax characters, NUL, surrounding whitespace, or a list or heading marker at the start.
 */
const MARKDOWN_SYNTAX_RE = /[\n\r\0\\`*_~[\]<>#&|!]|^\s|\s$|^\d+[.)]|^[-+=]/;

/**
 * Returns a shared markdown-it renderer.
 * Construction compiles large regular expressions, which takes seconds on slow TV browsers.
 */
function getMarkdown() {
    if (!instance) {
        // Callers sanitize the rendered HTML with DOMPurify
        // eslint-disable-next-line sonarjs/disabled-auto-escaping
        instance = markdownIt({ html: true });
    }
    return instance;
}

/**
 * Renders markdown to HTML.
 * Plain text is wrapped in a paragraph directly, with the same output as markdown-it, so the renderer is only
 * created when it is needed.
 */
export function renderMarkdown(text: string) {
    if (!MARKDOWN_SYNTAX_RE.test(text)) {
        return text ? `<p>${text.replace(/"/g, '&quot;')}</p>\n` : '';
    }

    return getMarkdown().render(text);
}
