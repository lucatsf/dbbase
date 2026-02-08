import * as vscode from 'vscode';
import { Client as PGClient } from 'pg';
import * as mysql from 'mysql2/promise';

interface Connection {
    id: string;
    label: string;
    type: 'postgres' | 'mysql';
    host: string;
    port: number;
    user: string;
    database: string;
    password?: string;
}

// Variável global ao arquivo para persistir a seleção durante a sessão
let activeConnection: Connection | undefined = undefined;
let statusBarItem: vscode.StatusBarItem;
let resultsProvider: ResultsViewProvider;
let lastExecutedSql: string = '';

export function activate(context: vscode.ExtensionContext) {
    console.log('DBBase Extension está ativa!');
    
    // Inicializar Provider de Resultados (Painel Inferior)
    resultsProvider = new ResultsViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('dbbase.resultsView', resultsProvider)
    );

    // Inicializar Barra de Status
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'dbbase-connections.focus';
    context.subscriptions.push(statusBarItem);

    const updateStatusBar = () => {
        if (activeConnection) {
            statusBarItem.text = `$(database) DB: ${activeConnection.label} (${activeConnection.type})`;
            statusBarItem.tooltip = `Conectado a ${activeConnection.host}:${activeConnection.port}`;
            statusBarItem.show();
        } else {
            statusBarItem.hide();
        }
    };

    const connectionsProvider = new ConnectionsProvider(context);
    vscode.window.registerTreeDataProvider('dbbase-connections', connectionsProvider);

    const openEditor = async () => {
        const doc = await vscode.workspace.openTextDocument({ 
            language: 'sql', 
            content: '-- DBBase Editor\nSELECT * FROM users;\n' 
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    };

    context.subscriptions.push(vscode.commands.registerCommand('dbbase.openQueryEditor', openEditor));

    context.subscriptions.push(vscode.commands.registerCommand('dbbase.addConnection', async () => {
        const conn = await promptForConnection();
        if (conn) {
            connectionsProvider.saveConnection(conn);
            // Selecionar automaticamente a nova conexão
            activeConnection = conn;
            updateStatusBar();
            vscode.window.showInformationMessage(`Conexão "${conn.label}" criada e selecionada.`);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('dbbase.editConnection', async (node: ConnectionItem) => {
        const conn = await promptForConnection(node.info);
        if (conn) {
            connectionsProvider.saveConnection(conn, true);
            if (activeConnection?.id === conn.id) {
                activeConnection = conn;
                updateStatusBar();
            }
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('dbbase.deleteConnection', async (node: ConnectionItem) => {
        const confirm = await vscode.window.showWarningMessage(`Excluir "${node.info.label}"?`, { modal: true }, 'Sim');
        if (confirm === 'Sim') {
            connectionsProvider.deleteConnection(node.info.id);
            if (activeConnection?.id === node.info.id) {
                activeConnection = undefined;
                updateStatusBar();
            }
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('dbbase.selectConnection', async (conn: Connection) => {
        activeConnection = conn;
        updateStatusBar();
        vscode.window.showInformationMessage(`Banco Ativo: ${conn.label} (${conn.type})`);
        await openEditor();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('dbbase.runQuery', async () => {
        // Log para confirmar que ESTA extensão está sendo chamada
        console.log('[DBBASE-LOG] Comando runQuery disparado');
        
        if (!activeConnection) {
            vscode.window.showErrorMessage("Selecione um banco na Sidebar do DBBase!");
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const sql = editor.document.getText(editor.selection.isEmpty ? undefined : editor.selection);
        if (!sql) {
            return;
        }

        lastExecutedSql = sql;

        // Mostrar o painel de resultados
        vscode.commands.executeCommand('dbbase.resultsView.focus');

        try {
            let rows: any[] = [];
            
            const { type, host, port, user, password, database } = activeConnection;
            
            console.log(`[DBBASE-LOG] Conectando ao ${type} em ${host}:${port}`);

            if (type === 'postgres') {
                // Alerta se a porta parecer errada
                if (port === 3306) {
                    vscode.window.showWarningMessage("Aviso: Você está usando Postgres na porta 3306 (padrão MySQL). Verifique as configurações.");
                }

                const client = new PGClient({
                    user: user,
                    host: host,
                    database: database || 'postgres',
                    password: password || undefined,
                    port: port,
                    connectionTimeoutMillis: 5000,
                });
                
                try {
                    await client.connect();
                    const res = await client.query(sql);
                    rows = res.rows;
                } finally {
                    await client.end().catch(() => {});
                }
            } else {
                // MySQL
                if (port === 5432) {
                    vscode.window.showWarningMessage("Aviso: Você está usando MySQL na porta 5432 (padrão Postgres). Verifique as configurações.");
                }

                const conn = await mysql.createConnection({
                    host: host,
                    user: user,
                    password: password,
                    database: database,
                    port: port,
                    connectTimeout: 5000
                });
                try {
                    const [result] = await conn.execute(sql);
                    rows = result as any[];
                } finally {
                    await conn.end().catch(() => {});
                }
            }
            resultsProvider.updateHtml(getTableHtml(rows));
        } catch (err: any) {
            const errorMsg = err.message || 'Erro desconhecido';
            const errorHtml = `
                <body style="background:var(--vscode-editor-background);color:var(--vscode-errorForeground);padding:20px;font-family:sans-serif;">
                    <h3>❌ Erro na Query</h3>
                    <code>${errorMsg}</code>
                    <p style="font-size:11px;color:var(--vscode-descriptionForeground)">Verifique as credenciais e o host (${activeConnection.host}:${activeConnection.port})</p>
                </body>`;
            resultsProvider.updateHtml(errorHtml);
            vscode.window.showErrorMessage(`ERRO NO ${activeConnection.type.toUpperCase()}: ${errorMsg}`);
        }
    }));
}

class ResultsViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        
        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'updateCell') {
                await this.handleUpdateCell(message.data);
            } else if (message.command === 'refresh') {
                vscode.commands.executeCommand('dbbase.runQuery');
            }
        });

        webviewView.webview.html = `
            <body style="background:var(--vscode-editor-background);color:var(--vscode-descriptionForeground);display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:sans-serif;">
                Aguardando execução da query...
            </body>`;
    }

    private async handleUpdateCell(data: { column: string, value: any, rowData: any }) {
        if (!activeConnection) {
            return;
        }

        // Tentar extrair o nome da tabela do SQL
        const tableMatch = lastExecutedSql.match(/FROM\s+([a-zA-Z0-9_.-]+)/i);
        const tableName = tableMatch ? tableMatch[1] : null;

        if (!tableName) {
            vscode.window.showErrorMessage("Não foi possível identificar a tabela para o update.");
            return;
        }

        // Tentar identificar a PK (preferência por 'id')
        const pkColumn = Object.keys(data.rowData).find(k => k.toLowerCase() === 'id') || Object.keys(data.rowData)[0];
        const pkValue = data.rowData[pkColumn];

        if (pkValue === undefined) {
            vscode.window.showErrorMessage("Não foi possível identificar uma chave primária (ID) para atualizar.");
            return;
        }

        const type = activeConnection.type;
        const updateSql = type === 'postgres' 
            ? `UPDATE ${tableName} SET "${data.column}" = $1 WHERE "${pkColumn}" = $2`
            : `UPDATE ${tableName} SET \`${data.column}\` = ? WHERE \`${pkColumn}\` = ?`;

        const params = [data.value, pkValue];

        try {
            if (type === 'postgres') {
                const client = new PGClient({
                    user: activeConnection.user,
                    host: activeConnection.host,
                    database: activeConnection.database || 'postgres',
                    password: activeConnection.password,
                    port: activeConnection.port,
                });
                await client.connect();
                await client.query(updateSql, params);
                await client.end();
            } else {
                const conn = await mysql.createConnection({
                    host: activeConnection.host,
                    user: activeConnection.user,
                    password: activeConnection.password,
                    database: activeConnection.database,
                    port: activeConnection.port
                });
                await conn.execute(updateSql, params);
                await conn.end();
            }
            vscode.window.showInformationMessage(`Registro atualizado com sucesso em ${tableName}!`);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Erro ao atualizar: ${err.message}`);
        }
    }

    updateHtml(html: string) {
        if (this._view) {
            this._view.show?.(true);
            this._view.webview.html = html;
        }
    }
}

async function promptForConnection(existing?: Connection): Promise<Connection | undefined> {
    const type = await vscode.window.showQuickPick(['postgres', 'mysql'], { placeHolder: 'Selecione o Tipo' });
    if (!type) {
        return;
    }

    const label = await vscode.window.showInputBox({ placeHolder: 'Nome da Conexão', value: existing?.label || 'Meu Banco' });
    const host = await vscode.window.showInputBox({ placeHolder: 'Host', value: existing?.host || '127.0.0.1' });
    const portInput = await vscode.window.showInputBox({ placeHolder: 'Porta', value: existing?.port?.toString() || (type === 'postgres' ? '5432' : '3306') });
    const user = await vscode.window.showInputBox({ placeHolder: 'Usuário', value: existing?.user || (type === 'postgres' ? 'postgres' : 'root') });
    const password = await vscode.window.showInputBox({ placeHolder: 'Senha', password: true, value: existing?.password });
    const database = await vscode.window.showInputBox({ placeHolder: 'Banco de Dados', value: existing?.database || '' });

    if (label && host && portInput && user) {
        return {
            id: existing?.id || Date.now().toString(),
            type: type as any,
            label,
            host,
            port: parseInt(portInput),
            user,
            password: password || '',
            database: database || (type === 'postgres' ? 'postgres' : '')
        };
    }
    return undefined;
}

class ConnectionsProvider implements vscode.TreeDataProvider<ConnectionItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<ConnectionItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(private context: vscode.ExtensionContext) {}
    getTreeItem(element: ConnectionItem): vscode.TreeItem { return element; }
    async getChildren(): Promise<ConnectionItem[]> {
        const conns = this.context.globalState.get<Connection[]>('connections', []);
        return conns.map(c => new ConnectionItem(c));
    }
    saveConnection(conn: Connection, isEdit = false) {
        let conns = this.context.globalState.get<Connection[]>('connections', []);
        if (isEdit) {
            conns = conns.map(c => c.id === conn.id ? conn : c);
        } else {
            conns.push(conn);
        }
        this.context.globalState.update('connections', conns);
        this._onDidChangeTreeData.fire(undefined);
    }
    deleteConnection(id: string) {
        let conns = this.context.globalState.get<Connection[]>('connections', []);
        conns = conns.filter(c => c.id !== id);
        this.context.globalState.update('connections', conns);
        this._onDidChangeTreeData.fire(undefined);
    }
}

class ConnectionItem extends vscode.TreeItem {
    constructor(public readonly info: Connection) {
        super(info.label, vscode.TreeItemCollapsibleState.None);
        this.description = `${info.type} (${info.host})`;
        this.iconPath = new vscode.ThemeIcon(info.type === 'postgres' ? 'database' : 'server');
        this.contextValue = 'connection';
        this.command = { command: 'dbbase.selectConnection', title: 'Selecionar', arguments: [info] };
    }
}

function getTableHtml(data: any[]) {
    if (!data.length) {
        return `
            <body style="background:var(--vscode-editor-background);color:var(--vscode-disabledForeground);display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:sans-serif;">
                <div style="text-align:center;">
                    <div style="font-size: 2em; margin-bottom: 10px;">∅</div>
                    Query executada com sucesso. Nenhuma linha retornada.
                </div>
            </body>`;
    }

    const headers = Object.keys(data[0]);

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            :root {
                --border: var(--vscode-panel-border);
                --header-bg: var(--vscode-sideBar-background);
                --row-hover: var(--vscode-list-hoverBackground);
                --text: var(--vscode-editor-foreground);
                --accent: var(--vscode-button-background);
                --hover-bg: var(--vscode-toolbar-hoverBackground);
                --modified-bg: rgba(234, 179, 8, 0.15);
            }
            body { 
                background: var(--vscode-editor-background); 
                color: var(--text); 
                font-family: var(--vscode-font-family, 'Segoe UI', sans-serif); 
                margin: 0; 
                padding: 0;
                overflow: hidden;
            }
            .container {
                display: flex;
                flex-direction: column;
                height: 100vh;
                width: 100vw;
            }
            .toolbar {
                padding: 0 8px;
                background: var(--header-bg);
                border-bottom: 1px solid var(--border);
                display: flex;
                justify-content: flex-start;
                align-items: center;
                gap: 2px;
                height: 32px;
            }
            .icon-btn {
                background: transparent;
                color: var(--vscode-foreground);
                border: none;
                padding: 6px;
                border-radius: 3px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0.8;
            }
            .icon-btn:hover:not(:disabled) {
                background: var(--hover-bg);
                opacity: 1;
            }
            .icon-btn:disabled {
                opacity: 0.2;
                cursor: not-allowed;
            }
            .icon-btn svg {
                width: 14px;
                height: 14px;
                fill: currentColor;
            }
            .icon-btn.save { color: var(--vscode-charts-green); }
            .icon-btn.cancel { color: var(--vscode-charts-red); }
            .icon-btn.refresh { color: var(--vscode-foreground); }

            .table-container {
                flex: 1;
                overflow: auto;
                position: relative;
            }
            table { 
                border-collapse: separate; 
                border-spacing: 0;
                width: 100%; 
                font-size: 12px;
            }
            th { 
                background: var(--header-bg); 
                padding: 6px 10px; 
                text-align: left; 
                position: sticky; 
                top: 0; 
                z-index: 10;
                border-bottom: 1px solid var(--border);
                border-right: 1px solid var(--border);
                white-space: nowrap;
                font-weight: 600;
                color: var(--vscode-symbolIcon-propertyForeground);
            }
            td { 
                padding: 4px 10px; 
                border-bottom: 1px solid var(--border); 
                border-right: 1px solid var(--border);
                white-space: nowrap;
                max-width: 300px;
                overflow: hidden;
                text-overflow: ellipsis;
                cursor: cell;
            }
            td.modified {
                background: var(--modified-bg) !important;
                outline: 1px solid var(--vscode-charts-yellow);
            }
            tr:hover td {
                background: var(--row-hover);
            }
            .row-num {
                width: 30px;
                text-align: center;
                background: var(--header-bg);
                color: var(--vscode-descriptionForeground);
                font-size: 10px;
                border-right: 1px solid var(--border);
            }
            input.edit-input {
                width: 100%;
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-focusBorder);
                padding: 2px 4px;
                font-family: inherit;
                font-size: inherit;
                outline: none;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="toolbar">
                <button id="refreshBtn" class="icon-btn refresh" title="F5 - Atualizar">
                    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M4.681 3H2V2h3.5l.5.5V6H5V4a5 5 0 1 0 5 5h1a6 6 0 1 1-6.319-6z"/></svg>
                </button>
                <div style="width: 1px; height: 14px; background: var(--border); margin: 0 6px;"></div>
                <button id="saveBtn" class="icon-btn save" title="Ctrl+Enter - Aplicar Alterações" disabled>
                    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M13.485 1.929a.75.75 0 0 1 1.06 1.06l-7.5 7.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06L6.5 8.869l6.985-6.94z"/></svg>
                </button>
                <button id="cancelBtn" class="icon-btn cancel" title="Descartar Alterações" disabled>
                    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M7.061 8l-2.78-2.781a.665.665 0 1 1 .94-.94L8 7.061l2.781-2.78a.665.665 0 1 1 .94.94L8.939 8l2.782 2.781a.665.665 0 1 1-.941.94L8 8.939l-2.781 2.782a.665.665 0 1 1-.94-.941L7.061 8z"/></svg>
                </button>
            </div>
            <div class="table-container">
                <table id="resultsTable">
                    <thead>
                        <tr>
                            <th class="row-num">#</th>
                            ${headers.map(h => `<th>${h}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map((r, i) => `
                            <tr data-row='${JSON.stringify(r).replace(/'/g, "&apos;")}'>
                                <td class="row-num">${i + 1}</td>
                                ${headers.map(h => {
                                    const val = r[h];
                                    const displayVal = val === null ? 'NULL' : (typeof val === 'object' ? JSON.stringify(val) : val);
                                    return `<td data-col="${h}">${displayVal}</td>`;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            const table = document.getElementById('resultsTable');
            const saveBtn = document.getElementById('saveBtn');
            const cancelBtn = document.getElementById('cancelBtn');
            const refreshBtn = document.getElementById('refreshBtn');
            let pendingChanges = [];

            table.addEventListener('dblclick', (e) => {
                const td = e.target.closest('td');
                if (!td || td.classList.contains('row-num')) return;

                if (td.querySelector('input')) return;

                const originalValue = td.innerText === 'NULL' ? '' : td.innerText;
                const colName = td.getAttribute('data-col');
                const rowData = JSON.parse(td.parentElement.getAttribute('data-row'));

                const input = document.createElement('input');
                input.className = 'edit-input';
                input.value = originalValue;
                
                td.innerText = '';
                td.appendChild(input);
                input.focus();

                input.onblur = () => finishEdit(td, input, originalValue, colName, rowData);
                input.onkeydown = (ke) => {
                    if (ke.key === 'Enter') input.blur();
                    if (ke.key === 'Escape') {
                        td.innerText = originalValue === '' ? 'NULL' : originalValue;
                    }
                };
            });

            function finishEdit(td, input, originalValue, colName, rowData) {
                const newValue = input.value;
                td.innerText = newValue === '' ? 'NULL' : newValue;
                
                if (newValue !== originalValue) {
                    td.classList.add('modified');
                    pendingChanges.push({
                        column: colName,
                        value: newValue,
                        rowData: rowData,
                        element: td,
                        oldValue: originalValue
                    });
                    saveBtn.disabled = false;
                    cancelBtn.disabled = false;
                }
            }

            const doSave = () => {
                if (pendingChanges.length === 0) return;
                
                pendingChanges.forEach(change => {
                    vscode.postMessage({
                        command: 'updateCell',
                        data: {
                            column: change.column,
                            value: change.value,
                            rowData: change.rowData
                        }
                    });
                    change.element.classList.remove('modified');
                });

                pendingChanges = [];
                saveBtn.disabled = true;
                cancelBtn.disabled = true;
            };

            const doCancel = () => {
                pendingChanges.forEach(change => {
                    change.element.innerText = change.oldValue === '' ? 'NULL' : change.oldValue;
                    change.element.classList.remove('modified');
                });
                pendingChanges = [];
                saveBtn.disabled = true;
                cancelBtn.disabled = true;
            };

            saveBtn.onclick = doSave;
            cancelBtn.onclick = doCancel;
            refreshBtn.onclick = () => vscode.postMessage({ command: 'refresh' });

            window.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'Enter') doSave();
            });
        </script>
    </body>
    </html>`;
}