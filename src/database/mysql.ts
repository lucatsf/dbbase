import * as mysql from 'mysql2/promise';
import { Connection, QueryResult } from '../types';
import { BaseDriver } from './driver';

export class MySQLDriver extends BaseDriver {
    private connection?: mysql.Connection;

    async connect(): Promise<void> {
        this.connection = await mysql.createConnection({
            host: this.config.host,
            user: this.config.user,
            password: this.config.password,
            database: this.config.database,
            port: this.config.port,
            connectTimeout: 5000,
            multipleStatements: true
        });
    }

    async query(sql: string, params?: any[]): Promise<QueryResult> {
        if (!this.connection) {
            throw new Error('Driver not connected');
        }

        const startTime = Date.now();
        const [result] = await this.connection.execute(sql, params);
        const executionTime = Date.now() - startTime;

        let rows: any[] = [];
        let affectedRows: number | undefined;

        if (Array.isArray(result)) {
            rows = result as any[];
        } else {
            const resObj = result as any;
            affectedRows = resObj.affectedRows;
            rows = [{ 
                status: "Success", 
                affectedRows: resObj.affectedRows, 
                time: `${executionTime}ms`
            }];
        }

        return {
            rows,
            affectedRows,
            executionTime
        };
    }

    async disconnect(): Promise<void> {
        if (this.connection) {
            await this.connection.end().catch(() => {});
            this.connection = undefined;
        }
    }

    async getTables(): Promise<string[]> {
        const sql = `
            SELECT TABLE_NAME as name
            FROM information_schema.tables 
            WHERE table_schema = DATABASE() 
            AND table_type = 'BASE TABLE'
            ORDER BY TABLE_NAME;
        `;
        const result = await this.query(sql);
        return result.rows.map(r => r.name || r.TABLE_NAME || r.table_name);
    }

    async getSchema(): Promise<any[]> {
        const sql = `
            SELECT 
                TABLE_NAME as table_name, 
                COLUMN_NAME as column_name, 
                DATA_TYPE as data_type,
                COLUMN_COMMENT as description
            FROM information_schema.columns 
            WHERE table_schema = DATABASE()
            ORDER BY table_name, ordinal_position;
        `;
        const result = await this.query(sql);
        return result.rows;
    }

    async getTableDetails(tableName: string): Promise<any> {
        const indexesSql = `SHOW INDEX FROM \`${tableName}\`;`;
        const createSql = `SHOW CREATE TABLE \`${tableName}\`;`;

        const [indexes, createTable] = await Promise.all([
            this.query(indexesSql),
            this.query(createSql)
        ]);

        return {
            tableName,
            indexes: indexes.rows,
            createTable: createTable.rows[0]
        };
    }
}
