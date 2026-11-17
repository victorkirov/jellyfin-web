import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(import.meta.dirname, '../..');

function rootImportPath(file: string, visited = new Set<string>()): string[] | undefined {
    if (file === resolve(sourceRoot, 'RootAppRouter.tsx')) return [file];
    if (visited.has(file)) return;
    visited.add(file);
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
    for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || statement.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword) continue;
        const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
        const base = resolve(specifier.startsWith('.') ? dirname(file) : sourceRoot, specifier);
        const dependency = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js']
            .map(extension => base + extension).find(candidate => existsSync(candidate) && /\.[jt]sx?$/.test(candidate));
        if (!dependency) continue;
        const path = rootImportPath(dependency, visited);
        if (path) return [file, ...path];
    }
}

describe('shared navigation imports', () => {
    it.each(['router/appRouter.js', 'dialogHelper/dialogHelper.ts'])(
        '%s cannot reach the application root through static imports', file => {
            expect(rootImportPath(resolve(sourceRoot, 'components', file))).toBeUndefined();
        }
    );
});
