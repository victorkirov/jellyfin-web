import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('dispatches remote commands without allocating closures or an action table per event', () => {
    const source = ts.createSourceFile('inputCommandActions.ts', readFileSync('src/scripts/inputCommandActions.ts', 'utf8'), ts.ScriptTarget.Latest, true);
    const dispatch = source.statements.find((statement): statement is ts.FunctionDeclaration => ts.isFunctionDeclaration(statement) && statement.name?.text === 'dispatchCommand');
    expect(dispatch?.body).toBeDefined();
    const allocations: ts.Node[] = [];
    const visit = (node: ts.Node) => {
        if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isObjectLiteralExpression(node)) allocations.push(node);
        ts.forEachChild(node, visit);
    };
    if (dispatch?.body) visit(dispatch.body);
    expect(allocations).toHaveLength(0);
});
