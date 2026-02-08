import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { ResultsViewProvider } from '../../providers/results';

suite('Integration Test: ResultsViewProvider', () => {
    let provider: ResultsViewProvider;

    suiteSetup(() => {
        provider = new ResultsViewProvider(vscode.Uri.file('/'));
    });

    test('Provider should be defined', () => {
        assert.ok(provider);
    });

    test('updateResults should not crash when webview is not ready', () => {
        // Initially, the webview is undefined. updateResults should handle this gracefully.
        try {
            provider.updateResults([], 'SELECT 1', { id: '1', label: 'Test' } as any);
            assert.ok(true);
        } catch (e) {
            assert.fail('updateResults crashed with no webview');
        }
    });

    test('resolveWebviewView sets up the webview and updateResults sets HTML', () => {
        const mockWebviewView = {
            webview: {
                options: {},
                html: '',
                onDidReceiveMessage: new vscode.EventEmitter().event,
                asWebviewUri: (uri: vscode.Uri) => uri
            },
            onDidDispose: new vscode.EventEmitter().event,
            visible: true,
            show: () => {}
        } as any;

        const mockContext = {} as any;
        const mockToken = { isCancellationRequested: false } as any;

        provider.resolveWebviewView(mockWebviewView, mockContext, mockToken);
        
        provider.updateResults([{ id: 1 }], 'SELECT 1', { id: '1' } as any);

        assert.ok(mockWebviewView.webview.html.length > 0, 'HTML should be set');
        assert.ok(mockWebviewView.webview.options.enableScripts, 'Scripts should be enabled');
    });
});
