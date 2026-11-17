// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const config = createRequire(import.meta.url)('./webpack.common.js');
const getChunkName = config.optimization.splitChunks.cacheGroups.node_modules.name;

const initialChunk = { canBeInitial: () => true };
const asyncChunk = { canBeInitial: () => false };

describe('Vendor chunk names', () => {
    it('leaves lazy-only modules out of named startup packages', () => {
        expect(getChunkName(
            { context: '/project/node_modules/@mui/material/Autocomplete' },
            [asyncChunk]
        )).toBeUndefined();
        expect(getChunkName(
            { context: '/project/node_modules/axios/lib' },
            [asyncChunk]
        )).toBeUndefined();
    });

    it('keeps a stable package name for modules needed at startup', () => {
        expect(getChunkName(
            { context: '/project/node_modules/@mui/material/Button' },
            [initialChunk, asyncChunk]
        )).toBe('node_modules.@mui.material');
    });

    it('leaves unused async locale modules out of startup packages', () => {
        expect(getChunkName(
            { context: '/project/node_modules/date-fns/locale/ru' },
            [asyncChunk]
        )).toBeUndefined();
        expect(getChunkName(
            { context: '/project/node_modules/date-fns/locale/uk' },
            [asyncChunk]
        )).toBeUndefined();
    });

    it('leaves lazy modules async on Windows', () => {
        expect(getChunkName(
            { context: 'C:\\project\\node_modules\\date-fns\\locale\\ru' },
            [asyncChunk]
        )).toBeUndefined();
    });
});
