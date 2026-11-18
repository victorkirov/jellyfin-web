// @vitest-environment node
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

let eslint: ESLint;
const restrictions = (results: ESLint.LintResult[]) => results.flatMap(result => result.messages
    .filter(message => message.ruleId === 'import/no-restricted-paths'));

// Reuse the production boundary configuration without running unrelated lint rules.
beforeAll(async () => {
    const sourceConfig = await new ESLint().calculateConfigForFile('src/elements/emby-button/Button.tsx');
    if (!sourceConfig) throw new Error('Missing production ESLint configuration');
    eslint = new ESLint({
        overrideConfigFile: true,
        overrideConfig: [{
            files: ['**/*.{js,jsx,ts,tsx}'],
            languageOptions: {
                parser: sourceConfig.languageOptions?.parser,
                parserOptions: { ecmaFeatures: { jsx: true } }
            },
            plugins: { import: sourceConfig.plugins!.import },
            settings: sourceConfig.settings,
            rules: { 'import/no-restricted-paths': sourceConfig.rules!['import/no-restricted-paths'] }
        }]
    });
    await eslint.lintText("import 'lib/navigationHistory';\n", {
        filePath: 'src/elements/emby-button/Button.tsx'
    });
}, 60000);

describe('resolved module layers', () => {
    it.each([
        ['src/elements/emby-button/Button.tsx', 'components/loading/loading'],
        ['src/elements/emby-button/Button.tsx', '../../components/loading/loading'],
        ['src/utils/query/queryKeys.ts', 'apps/legacy/features/search/types'],
        ['src/utils/query/queryKeys.ts', '../../apps/legacy/features/search/types'],
        ['src/components/playback/skipsegment.ts', 'apps/legacy/features/search/types'],
        ['src/plugins/htmlVideoPlayer/plugin.ts', '../../apps/legacy/features/search/types']
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
        expect(results.length).toBeGreaterThan(0);
        expect(results.flatMap(result => restrictions([result])
            .map(message => `${result.filePath}:${message.line} ${message.message}`))).toEqual([]);
    }, 60000);
});
