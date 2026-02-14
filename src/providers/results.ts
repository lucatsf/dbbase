import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { getTableHtml } from '../utils/table-html';
import { DriverFactory } from '../database';
import { DataExporter } from '../utils/exporter';

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
                case 'exportData':
                    await this.handleExport(message.format, message.data);
                    break;
            }
        });
    }

    private async handleExport(format: string, data: any[]) {
        if (!data || data.length === 0) {
            vscode.window.showWarningMessage('Não há dados para exportar.');
            return;
        }

        const filters: { [name: string]: string[] } = {};
        switch (format) {
            case 'csv': filters['CSV Files'] = ['csv']; break;
            case 'json': filters['JSON Files'] = ['json']; break;
            case 'xlsx': filters['Excel Files'] = ['xlsx']; break;
            case 'md': filters['Markdown Files'] = ['md']; break;
            case 'sql': filters['SQL Files'] = ['sql']; break;
        }

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath || '', `export_${Date.now()}.${format}`)),
            filters: filters
        });

        if (!uri) return;

        try {
            let content: string | Buffer = '';

            switch (format) {
                case 'json':
                    content = JSON.stringify(data, null, 2);
                    break;
                case 'csv':
                    content = DataExporter.toCSV(data);
                    break;
                case 'md':
                    content = DataExporter.toMarkdown(data);
                    break;
                case 'sql':
                    const tableName = this.getTableName(this._lastQuery || 'exported_table');
                    content = DataExporter.toSQL(data, tableName);
                    break;
                case 'xlsx':
                    const worksheet = XLSX.utils.json_to_sheet(data);
                    const workbook = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
                    content = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
                    break;
            }

            fs.writeFileSync(uri.fsPath, content);
            vscode.window.showInformationMessage(`Dados exportados com sucesso para: ${path.basename(uri.fsPath)}`);
            
            // Pergunta se quer abrir o arquivo
            const openAction = 'Abrir Arquivo';
            vscode.window.showInformationMessage('Exportação concluída!', openAction).then(selection => {
                if (selection === openAction) {
                    vscode.workspace.openTextDocument(uri).then(doc => vscode.window.showTextDocument(doc));
                }
            });

        } catch (err: any) {
            vscode.window.showErrorMessage(`Erro ao exportar: ${err.message}`);
        }
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
            const quote = this._lastConnection.type === 'mysql' ? '`' : '"';
            
            // Placeholder dinâmico (MySQL: ?, Postgres: $n)
            const p1 = this._lastConnection.type === 'mysql' ? '?' : '$1';
            const p2 = this._lastConnection.type === 'mysql' ? '?' : '$2';

            const updateQuery = `UPDATE ${quote}${this.getTableName(this._lastQuery!)}${quote} SET ${quote}${data.column}${quote} = ${p1} WHERE ${quote}${pkColumn}${quote} = ${p2}`;
            
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
