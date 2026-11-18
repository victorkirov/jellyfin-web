// @vitest-environment node
import path from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('retains browser media globals without exposing removed Windows adapters', () => {
    const fixturePath = path.resolve('tests/removedWindowsFixture.ts');
    const fixture = 'window.Windows; Windows; window.webkitAudioContext; navigator.audioSession;';
    const options: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        baseUrl: path.resolve('src'),
        types: [],
        skipLibCheck: true,
        noEmit: true
    };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => fileName === fixturePath ?
        ts.createSourceFile(fileName, fixture, languageVersion) :
        getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
    const program = ts.createProgram([path.resolve('src/types/legacyMedia.d.ts'), fixturePath], options, host);
    const diagnostics = program.getSemanticDiagnostics(program.getSourceFile(fixturePath));
    expect(diagnostics.map(diagnostic => ({ code: diagnostic.code, text: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n') }))).toEqual([
        { code: 2551, text: "Property 'Windows' does not exist on type 'Window & typeof globalThis'. Did you mean 'Window'?" },
        { code: 2552, text: "Cannot find name 'Windows'. Did you mean 'Window'?" }
    ]);
});
