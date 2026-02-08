import { Connection, QueryResult } from '../types';

export interface IDatabaseDriver {
    connect(): Promise<void>;
    query(sql: string, params?: any[]): Promise<QueryResult>;
    disconnect(): Promise<void>;
}

export abstract class BaseDriver implements IDatabaseDriver {
    constructor(protected config: Connection) {}
    abstract connect(): Promise<void>;
    abstract query(sql: string, params?: any[]): Promise<QueryResult>;
    abstract disconnect(): Promise<void>;
}
