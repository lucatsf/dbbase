import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Connection } from '../types';

export class QueryManager {
    private static queriesFolderName = 'queries';

    static getBaseQueriesPath(context: vscode.ExtensionContext): string {
        return path.join(context.globalStorageUri.fsPath, this.queriesFolderName);
    }

    static getConnectionQueriesPath(context: vscode.ExtensionContext, connectionId: string): string {
        const root = this.getBaseQueriesPath(context);
        const folder = path.join(root, connectionId);
        if (!fs.existsSync(folder)) {
            fs.mkdirSync(folder, { recursive: true });
        }
        return folder;
    }

    static async getQueryFiles(context: vscode.ExtensionContext, connectionId: string): Promise<string[]> {
        const folder = this.getConnectionQueriesPath(context, connectionId);
        try {
            const files = fs.readdirSync(folder);
            return files
                .filter(f => f.endsWith('.sql'))
                .map(f => path.join(folder, f));
        } catch (e) {
            return [];
        }
    }

    static async createNewQuery(context: vscode.ExtensionContext, connection: Connection): Promise<string> {
        const folder = this.getConnectionQueriesPath(context, connection.id);
        const ext = 'sql';
        
        let index = 1;
        let fileName = `query_${index}.${ext}`;
        while (fs.existsSync(path.join(folder, fileName))) {
            index++;
            fileName = `query_${index}.${ext}`;
        }

        const filePath = path.join(folder, fileName);
        const initialContent = `-- DBBase Query: ${connection.label}\n${connection.type === 'redis' ? '# INFO' : 'SELECT 1;'}`;
        
        fs.writeFileSync(filePath, initialContent);
        return filePath;
    }

    static getConnectionIdFromUri(context: vscode.ExtensionContext, uri: vscode.Uri): string | undefined {
        const base = this.getBaseQueriesPath(context);
        if (uri.fsPath.startsWith(base)) {
            const relative = path.relative(base, uri.fsPath);
            const connectionId = relative.split(path.sep)[0];
            return connectionId;
        }
        return undefined;
    }
}
