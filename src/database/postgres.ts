import { Client } from 'pg';
import { Connection, QueryResult } from '../types';
import { BaseDriver } from './driver';

export class PostgresDriver extends BaseDriver {
    private client?: Client;

    async connect(): Promise<void> {
        this.client = new Client({
            user: this.config.user,
            host: this.config.host,
            database: this.config.database || 'postgres',
            password: this.config.password,
            port: this.config.port,
            connectionTimeoutMillis: 5000,
        });
        await this.client.connect();
    }

    async query(sql: string, params?: any[]): Promise<QueryResult> {
        if (!this.client) {
            throw new Error('Driver not connected');
        }
        
        const startTime = Date.now();
        const res = await this.client.query(sql, params);
        const executionTime = Date.now() - startTime;

        let rows: any[] = [];
        if (Array.isArray(res)) {
            rows = res[res.length - 1].rows || [];
        } else {
            rows = res.rows || [];
            if ((res.command === 'UPDATE' || res.command === 'INSERT' || res.command === 'DELETE') && rows.length === 0) {
                rows = [{ 
                    status: "Success", 
                    command: res.command, 
                    rows_affected: res.rowCount, 
                    time: `${executionTime}ms` 
                }];
            }
        }

        return {
            rows,
            command: !Array.isArray(res) ? res.command : undefined,
            affectedRows: !Array.isArray(res) ? (res.rowCount ?? undefined) : undefined,
            executionTime
        };
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.end().catch(() => {});
            this.client = undefined;
        }
    }

    async getTables(): Promise<string[]> {
        const sql = `
            SELECT table_name as name
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        `;
        const result = await this.query(sql);
        return result.rows.map(r => r.name || r.table_name);
    }

    async getSchema(): Promise<any[]> {
        const sql = `
            SELECT 
                t.table_name, 
                c.column_name, 
                c.data_type,
                pg_catalog.col_description(format('%s.%s', t.table_schema, t.table_name)::regclass::oid, c.ordinal_position) as description
            FROM information_schema.tables t
            JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
            WHERE t.table_schema = 'public' 
            AND t.table_type = 'BASE TABLE'
            ORDER BY t.table_name, c.ordinal_position;
        `;
        const result = await this.query(sql);
        return result.rows;
    }

    async getTableDetails(tableName: string): Promise<any> {
        // Obter constraints e índices
        const constraintsSql = `
            SELECT 
                conname as constraint_name,
                pg_get_constraintdef(c.oid) as definition
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE n.nspname = 'public'
            AND conrelid = '"${tableName}"'::regclass;
        `;
        
        const indexesSql = `
            SELECT 
                indexname,
                indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
            AND tablename = '${tableName}';
        `;

        const [constraints, indexes] = await Promise.all([
            this.query(constraintsSql),
            this.query(indexesSql)
        ]);

        return {
            tableName,
            constraints: constraints.rows,
            indexes: indexes.rows
        };
    }
}
