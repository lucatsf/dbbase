import * as assert from 'assert';
import * as vscode from 'vscode';
import { getQueryAtCursor } from '../../utils/query-parser';

suite('Query Parser Unit Tests', () => {
    test('Should return selection if not empty', async () => {
        // Mocking vscode.TextEditor is complex, usually we should use 
        // real vscode in integration tests, but let's try a simple mock
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
        
        // Mocking a document with a specific cursor position
        const mockEditor = {
            selection: {
                isEmpty: true,
                active: { line: 0, character: 15 } // In the middle of "SELECT 2"
            },
            document: {
                getText: (range?: any) => text,
                offsetAt: (pos: any) => 15
            }
        } as any;

        const result = getQueryAtCursor(mockEditor);
        assert.strictEqual(result, 'SELECT 2');
    });

    test('Should return empty string if no valid query found', () => {
        const text = '';
        const mockEditor = {
            selection: {
                isEmpty: true,
                active: { line: 0, character: 0 }
            },
            document: {
                getText: () => text,
                offsetAt: () => 0
            }
        } as any;

        const result = getQueryAtCursor(mockEditor);
        assert.strictEqual(result, '');
    });
});
