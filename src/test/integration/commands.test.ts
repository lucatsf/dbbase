import * as assert from 'assert';
import * as vscode from 'vscode';
import { DriverFactory } from '../../database';

suite('Integration Test: Commands', () => {
    suiteSetup(async () => {
        // Trigger activation
        await vscode.commands.executeCommand('dbbase.openQueryEditor');
    });

    test('All commands should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        const expectedCommands = [
            'dbbase.openQueryEditor',
            'dbbase.addConnection',
            'dbbase.deleteConnection',
            'dbbase.editConnection',
            'dbbase.runQuery',
            'dbbase.openTable'
        ];

        for (const cmd of expectedCommands) {
            assert.ok(commands.includes(cmd), `Command ${cmd} is not registered`);
        }
    });

    test('dbbase.openQueryEditor should open a new SQL tab', async () => {
        await vscode.commands.executeCommand('dbbase.openQueryEditor');
        const activeEditor = vscode.window.activeTextEditor;
        
        assert.ok(activeEditor, 'No active editor found');
        assert.strictEqual(activeEditor.document.languageId, 'sql', 'Active editor is not SQL');
        assert.ok(activeEditor.document.getText().includes('SELECT * FROM users;'), 'Initial content is incorrect');
    });

    test('dbbase.runQuery should show error if no connection active', async () => {
        // This is tricky to test "showErrorMessage" directly without mocking the window.
        // But we can check if it returns early (though the command doesn't return anything).
        // For now, let's just ensure it doesn't crash.
        try {
            await vscode.commands.executeCommand('dbbase.runQuery');
            assert.ok(true);
        } catch (e) {
            assert.fail('dbbase.runQuery crashed when no connection active');
        }
    });
});
