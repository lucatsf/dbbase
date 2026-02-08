import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
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
            const headers = Object.keys(data[0]);

            switch (format) {
                case 'json':
                    content = JSON.stringify(data, null, 2);
                    break;
                case 'csv':
                    const csvRows = [headers.join(',')];
                    data.forEach(row => {
                        const values = headers.map(h => {
                            const val = row[h];
                            return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val;
                        });
                        csvRows.push(values.join(','));
                    });
                    content = csvRows.join('\n');
                    break;
                case 'md':
                    const mdRows = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
                    data.forEach(row => {
                        mdRows.push(`| ${headers.map(h => row[h]).join(' | ')} |`);
                    });
                    content = mdRows.join('\n');
                    break;
                case 'sql':
                    const tableName = this.getTableName(this._lastQuery || 'exported_table');
                    const sqlRows = data.map(row => {
                        const cols = headers.join(', ');
                        const vals = headers.map(h => {
                            const val = row[h];
                            if (val === null) return 'NULL';
                            return typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : val;
                        }).join(', ');
                        return `INSERT INTO ${tableName} (${cols}) VALUES (${vals});`;
                    });
                    content = sqlRows.join('\n');
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
