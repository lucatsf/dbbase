import * as vscode from 'vscode';
import { Connection } from '../types';
import { DriverFactory } from '../database';

export class ConnectionsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {}

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            const conns = this.context.globalState.get<Connection[]>('connections', []);
            return conns.map(c => new ConnectionItem(c));
        }

        if (element instanceof ConnectionItem) {
            try {
                const driver = DriverFactory.create(element.info);
                await driver.connect();
                const tables = await driver.getTables();
                await driver.disconnect();

                return tables.map(table => new TableItem(table, element.info));
            } catch (err: any) {
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
    constructor(public readonly info: Connection) {
        super(info.label, vscode.TreeItemCollapsibleState.Collapsed);
        this.description = `${info.type} (${info.host})`;
        this.iconPath = new vscode.ThemeIcon(info.type === 'postgres' ? 'database' : 'server');
        this.contextValue = 'connection';
        // Removemos o comando de clique padrão para não conflitar com a expansão (opcional)
        // Ou mantemos se quisermos que selecione e expanda ao mesmo tempo.
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
