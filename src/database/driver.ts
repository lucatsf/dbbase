import { Connection, QueryResult } from '../types';

export interface IDatabaseDriver {
    connect(): Promise<void>;
    query(sql: string, params?: any[]): Promise<QueryResult>;
    disconnect(): Promise<void>;
    getTables(): Promise<string[]>;
    getSchema(): Promise<any[]>;
    getTableDetails(tableName: string): Promise<any>;
}

export abstract class BaseDriver implements IDatabaseDriver {
    constructor(protected config: Connection) {}
    abstract connect(): Promise<void>;
    abstract query(sql: string, params?: any[]): Promise<QueryResult>;
    abstract disconnect(): Promise<void>;
    abstract getTables(): Promise<string[]>;
    abstract getSchema(): Promise<any[]>;
    abstract getTableDetails(tableName: string): Promise<any>;
}
