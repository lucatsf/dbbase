import * as assert from 'assert';
import * as vscode from 'vscode';
import { getQueryAtCursor, splitSQL } from '../../utils/query-parser';

suite('Query Parser Unit Tests', () => {
    test('splitSQL should correctly split multiple statements', () => {
        const sql = "SELECT 1; SELECT 'val;ue'; SELECT 2;";
        const results = splitSQL(sql);
        assert.strictEqual(results.length, 3);
        assert.strictEqual(results[0], 'SELECT 1');
        assert.strictEqual(results[1], "SELECT 'val;ue'");
        assert.strictEqual(results[2], "SELECT 2");
    });

    test('splitSQL should handle multi-line comments', () => {
        const sql = "SELECT 1; /* comment with ; */ SELECT 2;";
        const results = splitSQL(sql);
        assert.strictEqual(results.length, 2);
    });

    test('Should return selection if not empty', async () => {
        const mockEditor = {
            selection: {
                isEmpty: false
            },
            document: {
                getText: (selection: any) => 'SELECT * FROM test'
            }
        } as any;

        const result = getQueryAtCursor(mockEditor);
        assert.strictEqual(result, 'SELECT * FROM test');
    });

    test('Should find query at cursor when selection is empty', () => {
        const text = 'SELECT 1; SELECT 2; SELECT 3;';
        
        const mockEditor = {
            selection: {
                isEmpty: true,
                active: new vscode.Position(0, 15)
            },
            document: {
                getText: () => text,
                offsetAt: (pos: vscode.Position) => pos.character,
                positionAt: (offset: number) => new vscode.Position(0, offset)
            }
        } as any;

        const result = getQueryAtCursor(mockEditor);
        assert.strictEqual(result, 'SELECT 2');
    });
});
