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
}
