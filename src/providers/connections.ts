import * as vscode from 'vscode';
import { Connection } from '../types';
import { DriverFactory } from '../database';

export class ConnectionsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private connectionStatuses: Map<string, 'online' | 'offline' | 'unknown'> = new Map();

    constructor(private context: vscode.ExtensionContext) {}

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    async testConnection(conn: Connection): Promise<boolean> {
        try {
            const driver = DriverFactory.create(conn);
            await driver.connect();
            await driver.disconnect();
            this.connectionStatuses.set(conn.id, 'online');
            this.refresh();
            return true;
        } catch (err) {
            this.connectionStatuses.set(conn.id, 'offline');
            this.refresh();
            return false;
        }
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            const conns = this.context.globalState.get<Connection[]>('connections', []);
            return conns.map(c => {
                const status = this.connectionStatuses.get(c.id) || 'unknown';
                return new ConnectionItem(c, status);
            });
        }

        if (element instanceof ConnectionItem) {
            try {
                const driver = DriverFactory.create(element.info);
                await driver.connect();
                const tables = await driver.getTables();
                await driver.disconnect();

                if (this.connectionStatuses.get(element.info.id) !== 'online') {
                    this.connectionStatuses.set(element.info.id, 'online');
                    this.refresh();
                }
                return tables.map(table => new TableItem(table, element.info));
            } catch (err: any) {
                if (this.connectionStatuses.get(element.info.id) !== 'offline') {
                    this.connectionStatuses.set(element.info.id, 'offline');
                    this.refresh();
                }
                vscode.window.showErrorMessage(`Erro ao carregar tabelas: ${err.message}`);
                return [];
            }
        }

        return [];
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

    async addConnection() {
        const conn = await this.promptForConnection();
        if (conn) {
            this.saveConnection(conn);
            vscode.window.showInformationMessage(`Conexão "${conn.label}" criada.`);
        }
    }

    async editConnection(node: ConnectionItem) {
        const conn = await this.promptForConnection(node.info);
        if (conn) {
            this.saveConnection(conn, true);
        }
    }

    async deleteConnection(node: ConnectionItem) {
        const confirm = await vscode.window.showWarningMessage(`Excluir "${node.info.label}"?`, { modal: true }, 'Sim');
        if (confirm === 'Sim') {
            let conns = this.context.globalState.get<Connection[]>('connections', []);
            conns = conns.filter(c => c.id !== node.info.id);
            this.context.globalState.update('connections', conns);
            this._onDidChangeTreeData.fire(undefined);
        }
    }

    private async promptForConnection(existing?: Connection): Promise<Connection | undefined> {
        const type = await vscode.window.showQuickPick(['postgres', 'mysql'], { placeHolder: 'Selecione o Tipo' });
        if (!type) { return; }

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
}

export class ConnectionItem extends vscode.TreeItem {
    constructor(
        public readonly info: Connection,
        public readonly status: 'online' | 'offline' | 'unknown' = 'unknown'
    ) {
        super(info.label, vscode.TreeItemCollapsibleState.Collapsed);
        
        this.description = info.type;
        
        // Estilo Pro: Muda a cor do ícone principal conforme o status (Minimalista)
        let iconColor: string | undefined;
        if (status === 'online') iconColor = 'charts.green';
        if (status === 'offline') iconColor = 'charts.red';
        
        this.iconPath = iconColor 
            ? new vscode.ThemeIcon('database', new vscode.ThemeColor(iconColor))
            : new vscode.ThemeIcon('database');

        this.contextValue = `connection-${status}`;
        this.command = { 
            command: 'dbbase.selectConnection', 
            title: 'Selecionar', 
            arguments: [info] 
        };
    }
}

export class TableItem extends vscode.TreeItem {
    constructor(
        public readonly tableName: string,
        public readonly connection: Connection
    ) {
        super(tableName, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('table');
        this.contextValue = 'table';
        this.command = {
            command: 'dbbase.openTable',
            title: 'Abrir Tabela',
            arguments: [tableName, connection]
        };
    }
}
