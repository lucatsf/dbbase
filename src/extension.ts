import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ConnectionsProvider, QueryFileItem } from './providers/connections';
import { ResultsViewProvider } from './providers/results';
import { RedisEditorProvider } from './providers/redis-editor';
import { TableDataEditor } from './providers/table-editor';
import { DriverFactory } from './database';
import { Connection } from './types';
import { getQueryAtCursor } from './utils/query-parser';
import { QueryManager } from './utils/query-manager';

let activeConnection: Connection | undefined = undefined;
let statusBarItem: vscode.StatusBarItem;
let resultsProvider: ResultsViewProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('[DBBASE] Extension modularizada e ativa!');

    // 1. Providers
    const connectionsProvider = new ConnectionsProvider(context);
    const connectionsView = vscode.window.createTreeView('dbbase-connections', {
        treeDataProvider: connectionsProvider,
        showCollapseAll: true
    });

    resultsProvider = new ResultsViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ResultsViewProvider.viewType, resultsProvider)
    );

    // 2. Status Bar
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'dbbase-connections.focus';
    context.subscriptions.push(statusBarItem);

    const updateStatusBar = () => {
        if (activeConnection) {
            statusBarItem.text = `$(database) DB: ${activeConnection.label} (${activeConnection.type})`;
            statusBarItem.tooltip = `Conectado a ${activeConnection.host}:${activeConnection.port}`;
            statusBarItem.show();
            
            // Força o status para 'online' na TreeView caso não esteja
            connectionsProvider.setConnectionStatus(activeConnection.id, 'online');
        } else {
            statusBarItem.hide();
        }
    };

    // Auto-associação de conexão ao mudar de arquivo
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            const connectionId = QueryManager.getConnectionIdFromUri(context, editor.document.uri);
            if (connectionId) {
                const conns = context.globalState.get<Connection[]>('connections', []);
                const conn = conns.find(c => c.id === connectionId);
                if (conn && conn.id !== activeConnection?.id) {
                    activeConnection = conn;
                    updateStatusBar();
                }
            }
        }
    }));

    // 3. Commands
    context.subscriptions.push(vscode.commands.registerCommand('dbbase.selectConnection', async (conn: Connection) => {
        activeConnection = conn;
        updateStatusBar();

        // Testa a conexão em background para atualizar o status na Sidebar
        connectionsProvider.testConnection(conn);

        // Salva conexão ativa para o servidor MCP
        const configDir = context.globalStorageUri.fsPath;
        const configPath = path.join(configDir, 'active_connection.json');
        try {
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            fs.writeFileSync(configPath, JSON.stringify(conn, null, 2));
        } catch (err) {
            console.error('[DBBASE] Erro ao salvar active_connection.json:', err);
        }

        vscode.window.showInformationMessage(`Banco Ativo: ${conn.label}`);
        
        // Em vez de abrir um arquivo temporário, criamos/abrimos um scratch file
        const filePath = await QueryManager.createNewQuery(context, conn);
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        connectionsProvider.refresh();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('dbbase.openQueryFile', async (filePath: string, conn: Connection) => {
        activeConnection = conn;
        updateStatusBar();
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('dbbase.newQuery', async (node: any) => {
        const conn = node?.connection || activeConnection;
        if (!conn) {
            vscode.window.showErrorMessage("Selecione uma conexão primeiro.");
            return;
        }
        const filePath = await QueryManager.createNewQuery(context, conn);
        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        connectionsProvider.refresh();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('dbbase.deleteQuery', async (node: QueryFileItem) => {
        const confirm = await vscode.window.showWarningMessage(`Excluir query "${path.basename(node.filePath)}"?`, { modal: true }, 'Sim');
        if (confirm === 'Sim') {
            try {
                fs.unlinkSync(node.filePath);
                connectionsProvider.refresh();
            } catch (err: any) {
                vscode.window.showErrorMessage(`Erro ao excluir arquivo: ${err.message}`);
            }
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('dbbase.renameQuery', async (node: QueryFileItem) => {
        const newName = await vscode.window.showInputBox({ 
            prompt: 'Novo nome da query', 
            value: path.basename(node.filePath) 
        });
        if (newName && newName !== path.basename(node.filePath)) {
            const newPath = path.join(path.dirname(node.filePath), newName.endsWith('.sql') ? newName : `${newName}.sql`);
            try {
                fs.renameSync(node.filePath, newPath);
                connectionsProvider.refresh();
            } catch (err: any) {
                vscode.window.showErrorMessage(`Erro ao renomear arquivo: ${err.message}`);
            }
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('dbbase.openRedisKey', async (key: string, conn: Connection) => {
        await RedisEditorProvider.open(key, conn, context.extensionUri);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('dbbase.runQuery', async () => {
        if (!activeConnection) {
            vscode.window.showErrorMessage("Selecione um banco na Sidebar do DBBase!");
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const sql = getQueryAtCursor(editor, activeConnection.type);
        if (!sql) {
            return;
        }

        // Validação de segurança básica
        const isDataChangeQuery = /^(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i.test(sql);
        if (isDataChangeQuery && !sql.endsWith(';')) {
            vscode.window.showErrorMessage("⚠️ Query de alteração precisa terminar com ';' por segurança.");
            return;
        }

        // Focar no painel de resultados
        vscode.commands.executeCommand(`${ResultsViewProvider.viewType}.focus`);
        
        try {
            const driver = DriverFactory.create(activeConnection);
            await driver.connect();
            
            // Garante que o botão de desconectar apareça após uma query bem sucedida
            connectionsProvider.setConnectionStatus(activeConnection.id, 'online');

            const startTime = Date.now();
            const result = await driver.query(sql);
            const executionTime = Date.now() - startTime;

            let rows = result.rows;
            if (isDataChangeQuery && rows.length === 0) {
                // Feedback visual para comandos sem retorno de linhas
                rows = [{ 
                    status: "Success", 
                    rows_affected: result.rowCount, 
                    execution_time: `${executionTime}ms` 
                }];
            }

            resultsProvider.updateResults(rows, sql, activeConnection);
            vscode.window.setStatusBarMessage(`[DBBASE] Query executada em ${executionTime}ms`, 5000);
            
            await driver.disconnect();
        } catch (err: any) {
            vscode.window.showErrorMessage(`Erro na Query: ${err.message}`);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('dbbase.openQueryEditor', async () => {
        const doc = await vscode.workspace.openTextDocument({ 
            language: 'sql', 
            content: '-- DBBase Editor\nSELECT * FROM users;\n' 
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('dbbase.openTable', async (tableName: string, conn: Connection) => {
        if (!tableName) {
            vscode.window.showErrorMessage("Erro: Nome da tabela não identificado.");
            return;
        }

        activeConnection = conn;
        updateStatusBar();
        
        // Abre o visualizador de dados da tabela diretamente (estilo DataGrip)
        await TableDataEditor.open(tableName, conn, context.extensionUri);
    }));

    // Comandos da Sidebar
    context.subscriptions.push(vscode.commands.registerCommand('dbbase.addConnection', () => connectionsProvider.addConnection()));
    context.subscriptions.push(vscode.commands.registerCommand('dbbase.editConnection', (node) => connectionsProvider.editConnection(node)));
    context.subscriptions.push(vscode.commands.registerCommand('dbbase.deleteConnection', (node) => connectionsProvider.deleteConnection(node)));
    context.subscriptions.push(vscode.commands.registerCommand('dbbase.disconnectConnection', (node) => {
        if (activeConnection && activeConnection.id === node.info.id) {
            activeConnection = undefined;
            statusBarItem.hide();
        }
        connectionsProvider.disconnectConnection(node);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('dbbase.refreshConnections', () => connectionsProvider.refresh()));

    // Comando interno para sincronizar status entre diferentes views
    context.subscriptions.push(vscode.commands.registerCommand('dbbase.internal.setStatus', (id: string, status: any) => {
        connectionsProvider.setConnectionStatus(id, status);
    }));

    // Configuração Automática do MCP para Claude Desktop
    context.subscriptions.push(vscode.commands.registerCommand('dbbase.setupMCP', async () => {
        const configPath = os.platform() === 'win32' 
            ? path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json')
            : (os.platform() === 'darwin' 
                ? path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
                : path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json'));

        if (!fs.existsSync(configPath)) {
            const create = await vscode.window.showInformationMessage('Configuração do Claude Desktop não encontrada. Deseja criar?', 'Sim', 'Não');
            if (create !== 'Sim') return;
            const dir = path.dirname(configPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(configPath, JSON.stringify({ mcpServers: {} }, null, 2));
        }

        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (!config.mcpServers) config.mcpServers = {};

            const mcpServerPath = path.join(context.extensionPath, 'dist', 'mcp-server.js');
            const activeConnConfig = path.join(context.globalStorageUri.fsPath, 'active_connection.json');

            config.mcpServers.dbbase = {
                command: 'node',
                args: [mcpServerPath],
                env: {
                    DBBASE_MCP_CONFIG: activeConnConfig
                }
            };

            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            vscode.window.showInformationMessage('MCP da DBBase configurado no Claude Desktop com sucesso! Reinicie o Claude.');
        } catch (err: any) {
            vscode.window.showErrorMessage(`Falha ao configurar MCP: ${err.message}`);
        }
    }));
}

export function deactivate() {}
