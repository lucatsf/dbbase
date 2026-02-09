import * as vscode from 'vscode';
import { Connection } from '../types';
import { RedisDriver } from '../database/redis';
import { DriverFactory } from '../database';

export class RedisEditorProvider {
    public static async open(key: string, connection: Connection, extensionUri: vscode.Uri) {
        const panel = vscode.window.createWebviewPanel(
            'redisEditor',
            `Redis: ${key}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri]
            }
        );

        const driver = DriverFactory.create(connection) as RedisDriver;
        await driver.connect();
        const type = await driver.getKeyType(key);
        const value = await driver.getKeyValue(key);
        await driver.disconnect();

        panel.webview.html = this.getHtml(key, type, value, panel.webview);

        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'save':
                    try {
                        await driver.connect();
                        await driver.setKeyValue(key, message.value, type);
                        await driver.disconnect();
                        vscode.window.showInformationMessage(`Chave "${key}" salva com sucesso!`);
                    } catch (err: any) {
                        vscode.window.showErrorMessage(`Erro ao salvar: ${err.message}`);
                    }
                    break;
            }
        });
    }

    private static getHtml(key: string, type: string, value: any, webview: vscode.Webview): string {
        let editorHtml = '';
        
        if (type === 'string') {
            let displayValue = value;
            try {
                // Tenta formatar se for JSON
                const parsed = JSON.parse(value);
                displayValue = JSON.stringify(parsed, null, 4);
            } catch {}
            
            editorHtml = `
                <div class="field-container">
                    <label>Valor (String/JSON):</label>
                    <textarea id="redis-value" style="height: 400px; font-family: 'Courier New', Courier, monospace;">${displayValue}</textarea>
                </div>
            `;
        } else if (type === 'hash') {
            const rows = Object.entries(value).map(([id, val]) => `
                <tr>
                    <td contenteditable="true" class="hash-key">${id}</td>
                    <td contenteditable="true" class="hash-value">${val}</td>
                </tr>
            `).join('');

            editorHtml = `
                <div class="field-container">
                    <label>Valor (Hash):</label>
                    <table id="hash-table">
                        <thead>
                            <tr><th>Campo</th><th>Valor</th></tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            `;
        } else {
            editorHtml = `<p>Edição para o tipo <strong>${type}</strong> ainda não suportada via UI.</p><pre>${JSON.stringify(value, null, 2)}</pre>`;
        }

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: sans-serif; padding: 20px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
                    .field-container { display: flex; flex-direction: column; gap: 10px; }
                    label { font-weight: bold; color: var(--vscode-descriptionForeground); }
                    textarea, table { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 10px; }
                    table { border-collapse: collapse; }
                    th, td { border: 1px solid var(--vscode-panel-border); padding: 5px; text-align: left; }
                    th { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
                    button { 
                        margin-top: 20px; 
                        padding: 10px 20px; 
                        background: var(--vscode-button-background); 
                        color: var(--vscode-button-foreground); 
                        border: none; 
                        cursor: pointer; 
                        font-weight: bold;
                    }
                    button:hover { background: var(--vscode-button-hoverBackground); }
                </style>
            </head>
            <body>
                <h2>Redis Key: ${key}</h2>
                <p>Tipo: <code>${type}</code></p>
                <hr/>
                ${editorHtml}
                <button onclick="save()">Salvar Alterações</button>

                <script>
                    const vscode = acquireVsCodeApi();
                    function save() {
                        const type = '${type}';
                        let value;
                        if (type === 'string') {
                            value = document.getElementById('redis-value').value;
                        } else if (type === 'hash') {
                            value = {};
                            const rows = document.querySelectorAll('#hash-table tbody tr');
                            rows.forEach(row => {
                                const k = row.querySelector('.hash-key').innerText;
                                const v = row.querySelector('.hash-value').innerText;
                                if (k) value[k] = v;
                            });
                        }
                        vscode.postMessage({ command: 'save', value });
                    }
                </script>
            </body>
            </html>
        `;
    }
}
