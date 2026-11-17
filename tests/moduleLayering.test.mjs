// @vitest-environment node
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();
const restrictions = results => results.flatMap(result => result.messages
    .filter(message => message.ruleId === 'import/no-restricted-paths'));

describe('resolved module layers', () => {
    it.each([
        ['src/elements/emby-button/Button.tsx', 'components/loading/loading'],
        ['src/elements/emby-button/Button.tsx', '../../components/loading/loading'],
        ['src/utils/query/queryKeys.ts', 'apps/legacy/features/search/types'],
        ['src/utils/query/queryKeys.ts', '../../apps/legacy/features/search/types'],
        ['src/components/playback/skipsegment.ts', 'apps/legacy/features/search/types'],
        ['src/plugins/htmlVideoPlayer/plugin.js', '../../apps/legacy/features/search/types']
    ])('rejects %s importing %s', async (filePath, source) => {
        const results = await eslint.lintText(`import '${source}';\n`, { filePath });
        expect(restrictions(results)).toHaveLength(1);
    });

    it('allows foundational imports', async () => {
        const results = await eslint.lintText("import 'lib/navigationHistory';\n", {
            filePath: 'src/elements/emby-button/Button.tsx'
        });
        expect(restrictions(results)).toHaveLength(0);
    });

    it('has no restricted edges in the source graph', async () => {
        const results = await eslint.lintFiles(['src/elements', 'src/utils', 'src/components', 'src/plugins']);
        expect(results.flatMap(result => restrictions([result])
            .map(message => `${result.filePath}:${message.line} ${message.message}`))).toEqual([]);
    }, 60000);
});
