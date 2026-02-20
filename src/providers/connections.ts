import * as vscode from 'vscode';
import * as path from 'path';
import { Connection } from '../types';
import { DriverFactory } from '../database';
import { RedisDriver } from '../database/redis';
import { QueryManager } from '../utils/query-manager';

export class ConnectionsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private connectionStatuses: Map<string, 'online' | 'offline' | 'unknown'> = new Map();
    private forceCollapseIds: Set<string> = new Set();

    constructor(private context: vscode.ExtensionContext) {}

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    public setConnectionStatus(connectionId: string, status: 'online' | 'offline' | 'unknown') {
        if (this.connectionStatuses.get(connectionId) !== status) {
            this.connectionStatuses.set(connectionId, status);
            this.refresh();
        }
    }

    async testConnection(conn: Connection): Promise<boolean> {
        try {
            const driver = DriverFactory.create(conn);
            await driver.connect();
            await driver.disconnect();
            
            // Só damos refresh se o status realmente mudar, evitando loops
            if (this.connectionStatuses.get(conn.id) !== 'online') {
                this.connectionStatuses.set(conn.id, 'online');
                this.refresh();
            }
            return true;
        } catch (err) {
            if (this.connectionStatuses.get(conn.id) !== 'offline') {
                this.connectionStatuses.set(conn.id, 'offline');
                this.refresh();
            }
            return false;
        }
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        if (element instanceof ConnectionItem) {
            const isForced = this.forceCollapseIds.has(element.info.id);
            if (isForced) {
                // Altera o ID apenas nesta renderização para forçar o colapso
                (element as any).id = `${element.info.id}-collapsed-${Date.now()}`;
                this.forceCollapseIds.delete(element.info.id);
            }
        }
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            const conns = this.context.globalState.get<Connection[]>('connections', []);
            return conns.map(c => {
                const status = this.connectionStatuses.get(c.id) || 'unknown';
                const item = new ConnectionItem(c, status);
                
                // Se o banco já estiver online, mantemos ele expandido para evitar
                // que o refresh() do VS Code feche o chevron durante a navegação.
                if (status === 'online') {
                    item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
                }
                
                return item;
            });
        }

        if (element instanceof ConnectionItem) {
            // Sempre que o banco é expandido (pelo clique ou chevron), 
            // tentamos conectar se não estiver online.
            if (this.connectionStatuses.get(element.info.id) !== 'online') {
                this.testConnection(element.info);
            }

            return [
                new QueriesFolderItem(element.info),
                new TablesFolderItem(element.info)
            ];
        }

        if (element instanceof QueriesFolderItem) {
            const files = await QueryManager.getQueryFiles(this.context, element.connection.id);
            return files.map(file => new QueryFileItem(file, element.connection));
        }

        if (element instanceof TablesFolderItem) {
            // Removido bloqueio de status 'offline' aqui. 
            // Se o usuário expandir a pasta, permitimos que o driver tente a conexão.

            if (element.connection.type === 'redis') {
                return this.getRedisChildren(element.connection);
            }
            try {
                const driver = DriverFactory.create(element.connection);
                await driver.connect();
                const tables = await driver.getTables();
                await driver.disconnect();

                if (this.connectionStatuses.get(element.connection.id) !== 'online') {
                    this.connectionStatuses.set(element.connection.id, 'online');
                    this.refresh();
                }

                const config = vscode.workspace.getConfiguration('dbbase');
                const groupByPrefix = config.get<boolean>('groupTablesByPrefix', true);

                if (groupByPrefix) {
                    return this.groupTables(tables, element.connection);
                }

                return tables.map(table => new TableItem(table, element.connection));
            } catch (err: any) {
                if (this.connectionStatuses.get(element.connection.id) !== 'offline') {
                    this.connectionStatuses.set(element.connection.id, 'offline');
                    this.refresh();
                }
                vscode.window.showErrorMessage(`Error loading tables: ${err.message}`);
                return [];
            }
        }

        if (element instanceof TableGroupItem) {
            return element.tables.map(table => new TableItem(table, element.connection));
        }

        if (element instanceof RedisFolderItem) {
            return this.getRedisChildren(element.connection, element.fullPath + ':');
        }

        return [];
    }

    private groupTables(tables: string[], connection: Connection): vscode.TreeItem[] {
        const groups = new Map<string, string[]>();
        const soloTables: string[] = [];

        for (const table of tables) {
            const parts = table.split('_');
            if (parts.length > 1) {
                const prefix = parts[0];
                if (!groups.has(prefix)) {
                    groups.set(prefix, []);
                }
                groups.get(prefix)!.push(table);
            } else {
                soloTables.push(table);
            }
        }

        const items: vscode.TreeItem[] = [];

        // Add groups that have more than 1 table
        for (const [prefix, groupedTables] of groups) {
            if (groupedTables.length > 1) {
                items.push(new TableGroupItem(prefix, groupedTables, connection));
            } else {
                soloTables.push(groupedTables[0]);
            }
        }

        // Add solo tables
        soloTables.forEach(table => {
            items.push(new TableItem(table, connection));
        });

        return items.sort((a, b) => {
            if (a instanceof TableGroupItem && b instanceof TableItem) return -1;
            if (a instanceof TableItem && b instanceof TableGroupItem) return 1;
            return (a.label as string).localeCompare(b.label as string);
        });
    }

    private async getRedisChildren(connection: Connection, prefix: string = ''): Promise<vscode.TreeItem[]> {
        try {
            const driver = DriverFactory.create(connection) as RedisDriver;
            await driver.connect();
            
            // Usamos SCAN com paginação para não travar
            // Para simplicidade inicial, pegamos as primeiras 500 chaves para construir o nível atual
            const { keys } = await driver.scanKeys('0', prefix + '*', 500);
            await driver.disconnect();

            const folders = new Set<string>();
            const terminalKeys = new Set<string>();

            for (const key of keys) {
                const relativeKey = key.substring(prefix.length);
                const parts = relativeKey.split(':');
                if (parts.length > 1) {
                    folders.add(parts[0]);
                } else {
                    terminalKeys.add(key);
                }
            }

            const items: vscode.TreeItem[] = [];
            
            // Pastas
            folders.forEach(folder => {
                items.push(new RedisFolderItem(folder, prefix + folder, connection));
            });

            // Chaves
            terminalKeys.forEach(key => {
                items.push(new RedisKeyItem(key, connection));
            });

            return items.sort((a, b) => {
                if (a instanceof RedisFolderItem && b instanceof RedisKeyItem) return -1;
                if (a instanceof RedisKeyItem && b instanceof RedisFolderItem) return 1;
                return (a.label as string).localeCompare(b.label as string);
            });

        } catch (err: any) {
            vscode.window.showErrorMessage(`Redis Error: ${err.message}`);
            return [];
        }
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
            vscode.window.showInformationMessage(`Connection "${conn.label}" created.`);
        }
    }

    async editConnection(node: ConnectionItem) {
        const conn = await this.promptForConnection(node.info);
        if (conn) {
            this.saveConnection(conn, true);
        }
    }

    async deleteConnection(node: ConnectionItem) {
        const confirm = await vscode.window.showWarningMessage(`Delete "${node.info.label}"?`, { modal: true }, 'Yes');
        if (confirm === 'Yes') {
            let conns = this.context.globalState.get<Connection[]>('connections', []);
            conns = conns.filter(c => c.id !== node.info.id);
            this.context.globalState.update('connections', conns);
            this._onDidChangeTreeData.fire(undefined);
        }
    }

    async disconnectConnection(node: ConnectionItem) {
        this.forceCollapseIds.add(node.info.id);
        this.connectionStatuses.set(node.info.id, 'offline');
        this.refresh();
        vscode.window.showInformationMessage(`Connection "${node.info.label}" closed.`);
    }

    private async promptForConnection(existing?: Connection): Promise<Connection | undefined> {
        const type = await vscode.window.showQuickPick(['postgres', 'mysql', 'redis'], { placeHolder: 'Select Connection Type' });
        if (!type) { return; }

        const label = await vscode.window.showInputBox({ prompt: 'Connection Name', placeHolder: 'Ex: My Database', value: existing?.label || 'My Database' });
        const host = await vscode.window.showInputBox({ prompt: 'Host', placeHolder: 'Ex: 127.0.0.1', value: existing?.host || '127.0.0.1' });
        const defaultPort = type === 'postgres' ? '5432' : (type === 'mysql' ? '3306' : '6379');
        const portInput = await vscode.window.showInputBox({ prompt: 'Port', placeHolder: defaultPort, value: existing?.port?.toString() || defaultPort });
        const user = type !== 'redis' 
            ? await vscode.window.showInputBox({ prompt: 'User', placeHolder: type === 'postgres' ? 'postgres' : 'root', value: existing?.user || (type === 'postgres' ? 'postgres' : 'root') })
            : 'default';
        const password = await vscode.window.showInputBox({ prompt: 'Password', placeHolder: 'Password', password: true, value: existing?.password });
        const database = await vscode.window.showInputBox({ prompt: type === 'redis' ? 'Database Index (0-15)' : 'Database Name', placeHolder: type === 'redis' ? '0' : 'postgres', value: existing?.database || '0' });

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
        
        this.id = info.id;
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
            title: 'Select', 
            arguments: [info] 
        };
    }
}

export class QueriesFolderItem extends vscode.TreeItem {
    constructor(public readonly connection: Connection) {
        super('Scratches & Queries', vscode.TreeItemCollapsibleState.Collapsed);
        this.id = `${connection.id}-queries`;
        this.iconPath = new vscode.ThemeIcon('folder-library');
        this.contextValue = 'queries-folder';
    }
}

export class TablesFolderItem extends vscode.TreeItem {
    constructor(public readonly connection: Connection) {
        super(connection.type === 'redis' ? 'Keys' : 'Tables', vscode.TreeItemCollapsibleState.Collapsed);
        this.id = `${connection.id}-tables`;
        this.iconPath = new vscode.ThemeIcon('database');
        this.contextValue = 'tables-folder';
    }
}

export class QueryFileItem extends vscode.TreeItem {
    constructor(public readonly filePath: string, public readonly connection: Connection) {
        super(path.basename(filePath), vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('file-code');
        this.contextValue = 'query-file';
        this.command = {
            command: 'dbbase.openQueryFile',
            title: 'Open Query',
            arguments: [filePath, connection]
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
            title: 'Open Table',
            arguments: [tableName, connection]
        };
    }
}

export class TableGroupItem extends vscode.TreeItem {
    constructor(
        public readonly prefix: string,
        public readonly tables: string[],
        public readonly connection: Connection
    ) {
        super(prefix, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon('folder');
        this.contextValue = 'table-group';
        this.description = `${tables.length} tables`;
    }
}

export class RedisFolderItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly fullPath: string,
        public readonly connection: Connection
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.iconPath = new vscode.ThemeIcon('folder');
        this.contextValue = 'redis-folder';
    }
}

export class RedisKeyItem extends vscode.TreeItem {
    constructor(
        public readonly key: string,
        public readonly connection: Connection
    ) {
        const parts = key.split(':');
        super(parts[parts.length - 1], vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('key');
        this.contextValue = 'redis-key';
        this.description = 'redis';
        this.command = {
            command: 'dbbase.openRedisKey',
            title: 'Open Key',
            arguments: [key, connection]
        };
    }
}
