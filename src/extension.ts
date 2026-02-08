import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ConnectionsProvider } from './providers/connections';
import { ResultsViewProvider } from './providers/results';
import { DriverFactory } from './database';
import { Connection } from './types';
import { getQueryAtCursor } from './utils/query-parser';

let activeConnection: Connection | undefined = undefined;
let statusBarItem: vscode.StatusBarItem;
let resultsProvider: ResultsViewProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('[DBBASE] Extension modularizada e ativa!');

    // 1. Providers
    const connectionsProvider = new ConnectionsProvider(context);
    vscode.window.registerTreeDataProvider('dbbase-connections', connectionsProvider);

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
        } else {
            statusBarItem.hide();
        }
    };

    // 3. Commands
    context.subscriptions.push(vscode.commands.registerCommand('dbbase.selectConnection', async (conn: Connection) => {
        activeConnection = conn;
        updateStatusBar();

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
        
        // Abre editor SQL automaticamente
        const doc = await vscode.workspace.openTextDocument({ 
            language: 'sql', 
            content: `-- DBBase Editor - ${conn.label}\nSELECT * FROM users;\n` 
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
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

        const sql = getQueryAtCursor(editor);
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
        
        const sql = `SELECT * FROM ${activeConnection.type === 'mysql' ? `\`${tableName}\`` : `"${tableName}"`} LIMIT 50;`;
        const doc = await vscode.workspace.openTextDocument({ 
            language: 'sql', 
            content: `-- DBBase: ${tableName}\n${sql}\n` 
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        
        // Opcional: Executar automaticamente a query
        vscode.commands.executeCommand('dbbase.runQuery');
    }));

    // Comandos da Sidebar
    context.subscriptions.push(vscode.commands.registerCommand('dbbase.addConnection', () => connectionsProvider.addConnection()));
    context.subscriptions.push(vscode.commands.registerCommand('dbbase.editConnection', (node) => connectionsProvider.editConnection(node)));
    context.subscriptions.push(vscode.commands.registerCommand('dbbase.deleteConnection', (node) => connectionsProvider.deleteConnection(node)));

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
