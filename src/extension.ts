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
        webviewView.webview.html = `
            <body style="background:var(--vscode-editor-background);color:var(--vscode-descriptionForeground);display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:sans-serif;">
                Aguardando execução da query...
            </body>`;
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
                padding: 8px 12px;
                background: var(--header-bg);
                border-bottom: 1px solid var(--border);
                font-size: 11px;
                color: var(--vscode-descriptionForeground);
                display: flex;
                justify-content: space-between;
            }
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
            /* Scrollbar styling */
            ::-webkit-scrollbar { width: 10px; height: 10px; }
            ::-webkit-scrollbar-corner { background: var(--vscode-editor-background); }
            ::-webkit-scrollbar-thumb { background: var(--vscode-scrollbarSlider-background); }
            ::-webkit-scrollbar-thumb:hover { background: var(--vscode-scrollbarSlider-hoverBackground); }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="toolbar">
                <span>${data.length} linhas retornadas</span>
                <span>DBBase Grid View</span>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th class="row-num">#</th>
                            ${headers.map(h => `<th>${h}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map((r, i) => `
                            <tr>
                                <td class="row-num">${i + 1}</td>
                                ${headers.map(h => {
                                    const val = r[h];
                                    const displayVal = val === null ? '<i style="opacity:0.5">NULL</i>' : 
                                                      (typeof val === 'object' ? JSON.stringify(val) : val);
                                    return `<td>${displayVal}</td>`;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </body>
    </html>`;
}