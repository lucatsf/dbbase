import * as assert from 'assert';
import * as vscode from 'vscode';
import { ConnectionsProvider } from '../../providers/connections';
import { Connection } from '../../types';
import { DriverFactory } from '../../database';

suite('Integration Test: ConnectionsProvider', () => {
    let provider: ConnectionsProvider;
    let context: vscode.ExtensionContext;

    suiteSetup(async () => {
        // We need an extension context. In tests, we can't easily get the real one 
        // without activating the extension, but we can mock it or use the global one.
        // For simplicity, let's use a mock that uses a real Map for storage.
        const storage = new Map<string, any>();
        context = {
            globalState: {
                get: (key: string, defaultValue?: any) => storage.get(key) ?? defaultValue,
                update: (key: string, value: any) => { storage.set(key, value); return Promise.resolve(); }
            }
        } as any;
        provider = new ConnectionsProvider(context);
    });

    test('Should save and retrieve connections', async () => {
        const conn: Connection = {
            id: 'test-1',
            type: 'postgres',
            label: 'Test DB',
            host: 'localhost',
            port: 5432,
            user: 'user',
            password: 'pwd',
            database: 'db'
        };

        provider.saveConnection(conn);
        
        const children = await provider.getChildren();
        assert.strictEqual(children.length, 1);
        const item = children[0] as any;
        assert.strictEqual(item.label, 'Test DB');
        assert.strictEqual(item.info.id, 'test-1');
    });

    test('Should delete connections', async () => {
        // ... (existing code)
    });

    test('getChildren should listing tables for a connection', async () => {
        const conn: Connection = { id: 'test', type: 'postgres', label: 'T', host: 'h', port: 5432, user: 'u', password: 'p', database: 'd' };
        
        // Mock DriverFactory.create
        const originalCreate = DriverFactory.create;
        DriverFactory.create = () => ({
            connect: async () => {},
            getTables: async () => ['users', 'orders'],
            disconnect: async () => {},
            query: async () => ({ rows: [], rowCount: 0 })
        } as any);

        try {
            const children = await provider.getChildren(); // Get roots
            const tables = await provider.getChildren(children[0]);
            assert.strictEqual(tables.length, 2);
            assert.strictEqual(tables[0].label, 'users');
        } finally {
            DriverFactory.create = originalCreate;
        }
    });
});
