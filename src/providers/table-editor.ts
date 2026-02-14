import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import { Connection } from '../types';
import { DriverFactory } from '../database';
import { getTableHtml } from '../utils/table-html';
import { DataExporter } from '../utils/exporter';

export class TableDataEditor {
    public static async open(tableName: string, connection: Connection, extensionUri: vscode.Uri) {
        const panel = vscode.window.createWebviewPanel(
            'tableData',
            `Table: ${tableName}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );

        panel.iconPath = new vscode.ThemeIcon('table');
        let currentData: any[] = [];

        const loadData = async () => {
            try {
                const driver = DriverFactory.create(connection);
                await driver.connect();
                // Usamos aspas dependendo do tipo de banco
                const quote = connection.type === 'mysql' ? '`' : '"';
                const sql = `SELECT * FROM ${quote}${tableName}${quote} LIMIT 1000;`;
                const result = await driver.query(sql);
                await driver.disconnect();

                currentData = result.rows;
                panel.webview.html = getTableHtml(currentData);
            } catch (err: any) {
                vscode.window.showErrorMessage(`Erro ao carregar dados: ${err.message}`);
                panel.dispose();
            }
        };

        await loadData();

        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'refresh':
                    await loadData();
                    break;
                case 'exportData':
                    await this.handleExport(message.format, currentData, tableName);
                    break;
                case 'updateCell':
                    try {
                        const driver = DriverFactory.create(connection);
                        const pkColumn = Object.keys(message.data.rowData).find(k => k.toLowerCase() === 'id') || Object.keys(message.data.rowData)[0];
                        const pkValue = message.data.rowData[pkColumn];
                        const quote = connection.type === 'mysql' ? '`' : '"';
                        
                        // Placeholder dinâmico (MySQL: ?, Postgres: $n)
                        const p1 = connection.type === 'mysql' ? '?' : '$1';
                        const p2 = connection.type === 'mysql' ? '?' : '$2';
                        
                        const updateQuery = `UPDATE ${quote}${tableName}${quote} SET ${quote}${message.data.column}${quote} = ${p1} WHERE ${quote}${pkColumn}${quote} = ${p2}`;
                        
                        await driver.connect();
                        await driver.query(updateQuery, [message.data.value, pkValue]);
                        await driver.disconnect();
                        vscode.window.setStatusBarMessage(`[DBBASE] Dados atualizados na tabela ${tableName}.`, 3000);
                    } catch (err: any) {
                        vscode.window.showErrorMessage(`Erro ao atualizar: ${err.message}`);
                    }
                    break;
            }
        });
    }

    private static async handleExport(format: string, data: any[], tableName: string) {
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
            defaultUri: vscode.Uri.file(`export_${tableName}_${Date.now()}.${format}`),
            filters: filters
        });

        if (!uri) return;

        try {
            let content: string | Buffer = '';

            switch (format) {
                case 'json': content = JSON.stringify(data, null, 2); break;
                case 'csv': content = DataExporter.toCSV(data); break;
                case 'md': content = DataExporter.toMarkdown(data); break;
                case 'sql': content = DataExporter.toSQL(data, tableName); break;
                case 'xlsx':
                    const worksheet = XLSX.utils.json_to_sheet(data);
                    const workbook = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
                    content = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
                    break;
            }

            fs.writeFileSync(uri.fsPath, content);
            vscode.window.showInformationMessage(`Dados exportados com sucesso!`);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Erro ao exportar: ${err.message}`);
        }
    }
}
