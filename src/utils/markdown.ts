import markdownIt from 'markdown-it';
import { mark } from 'utils/tvPerf';

let instance: ReturnType<typeof markdownIt> | undefined;

/**
 * Returns a shared markdown-it renderer.
 * Construction compiles large regular expressions, which takes seconds on slow TV browsers.
 */
export function getMarkdown() {
    if (!instance) {
        // Callers sanitize the rendered HTML with DOMPurify
        // eslint-disable-next-line sonarjs/disabled-auto-escaping
        mark('markdown-construct-start');
        instance = markdownIt({ html: true });
        mark('markdown-construct-end');
    }
    return instance;
}
