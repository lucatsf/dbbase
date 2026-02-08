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

export function activate(context: vscode.ExtensionContext) {
    console.log('DBBase Extension está ativa!');
    
    let panel: vscode.WebviewPanel | undefined = undefined;

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
        vscode.window.showInformationMessage('DBBase: Executando Query...');

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

        if (!panel) {
            panel = vscode.window.createWebviewPanel('dbResults', 'Resultados: DBBase', vscode.ViewColumn.Two, { enableScripts: true });
            panel.onDidDispose(() => { panel = undefined; });
        }

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
            panel.webview.html = getTableHtml(rows);
        } catch (err: any) {
            const errorMsg = err.message || 'Erro desconhecido';
            vscode.window.showErrorMessage(`ERRO NO ${activeConnection.type.toUpperCase()}: ${errorMsg} (Host: ${activeConnection.host}:${activeConnection.port})`);
            console.error('Erro completo de conexão:', err);
        }
    }));
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
        return `<body style="background:var(--vscode-editor-background);color:white;padding:20px">Query executada com sucesso. Nenhuma linha retornada.</body>`;
    }
    const headers = Object.keys(data[0]);
    return `<html><head><style>
        body { background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: sans-serif; font-size: 12px; }
        table { border-collapse: collapse; width: 100%; border: 1px solid var(--vscode-panel-border); }
        th { background: var(--vscode-editor-lineHighlightBackground); padding: 8px; text-align: left; position: sticky; top: 0; border-bottom: 2px solid var(--vscode-panel-border); }
        td { padding: 8px; border-bottom: 1px solid var(--vscode-panel-border); }
    </style></head><body><table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${data.map(r => `<tr>${headers.map(h => `<td>${r[h]}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></body></html>`;
}