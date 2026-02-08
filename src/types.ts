export interface Connection {
    id: string;
    label: string;
    type: 'postgres' | 'mysql';
    host: string;
    port: number;
    user: string;
    database: string;
    password?: string;
}

export interface QueryResult {
    rows: any[];
    fields?: string[];
    affectedRows?: number;
    rowCount?: number;
    command?: string;
    executionTime?: number;
}
