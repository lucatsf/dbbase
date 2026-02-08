import * as vscode from 'vscode';
import { getTableHtml } from '../utils/table-html';
import { DriverFactory } from '../database';

export class ResultsViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'dbbase.resultsView';
    private _view?: vscode.WebviewView;
    private _lastResults?: any[];
    private _lastQuery?: string;
    private _lastConnection?: any;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'updateCell':
                    await this.handleUpdateCell(message.data);
                    break;
                case 'refresh':
                    if (this._lastQuery && this._lastConnection) {
                        vscode.commands.executeCommand('dbbase.executeQuery');
                    }
                    break;
            }
        });
    }

    public updateResults(data: any[], query: string, connection: any) {
        this._lastResults = data;
        this._lastQuery = query;
        this._lastConnection = connection;
        
        if (this._view) {
            this._view.show?.(true);
            this._view.webview.html = getTableHtml(data);
        }
    }

    private async handleUpdateCell(data: { column: string, value: any, rowData: any }) {
        if (!this._lastConnection) {
            return;
        }

        try {
            const driver = DriverFactory.create(this._lastConnection);
            // Identificar chave primária (simplificado: assume 'id' ou primeira coluna)
            const pkColumn = Object.keys(data.rowData).find(k => k.toLowerCase() === 'id') || Object.keys(data.rowData)[0];
            const pkValue = data.rowData[pkColumn];

            const updateQuery = `UPDATE "${this.getTableName(this._lastQuery!)}" SET "${data.column}" = $1 WHERE "${pkColumn}" = $2`;
            
            await driver.connect();
            await driver.query(updateQuery, [data.value, pkValue]);
            await driver.disconnect();

            vscode.window.setStatusBarMessage(`[DBBASE] Célula atualizada com sucesso.`, 3000);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Erro ao atualizar: ${err.message}`);
        }
    }

    private getTableName(query: string): string {
        const match = query.match(/from\s+([\w".]+)/i);
        return match ? match[1].replace(/"/g, '') : 'table';
    }
}
