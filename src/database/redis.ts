import Redis from 'ioredis';
import { Connection, QueryResult } from '../types';
import { BaseDriver } from './driver';

export class RedisDriver extends BaseDriver {
    private client: Redis | null = null;

    async connect(): Promise<void> {
        this.client = new Redis({
            host: this.config.host,
            port: this.config.port,
            password: this.config.password,
            db: parseInt(this.config.database) || 0,
            lazyConnect: true,
            connectTimeout: 5000
        });

        await this.client.connect();
    }

    async query(command: string, params?: any[]): Promise<QueryResult> {
        if (!this.client) { throw new Error('Redis not connected'); }
        const start = Date.now();
        
        // Remove comentários e linhas vazias, preservando o conteúdo para formar o comando
        const cleanLines = command.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('--') && !line.startsWith('#'));

        if (cleanLines.length === 0) {
            return { rows: [], executionTime: 0 };
        }

        // Unificamos as linhas em um único comando (padrão Redis CLI para blocos de texto)
        const fullCommand = cleanLines.join(' ');
        
        // Parsing básico de argumentos respeitando aspas (opcional, mas proativo)
        // Para simplicidade agora, mantemos o split por espaço:
        const parts = fullCommand.split(/\s+/);
        const cmdName = parts[0].toLowerCase();
        const args = parts.slice(1);
        
        if (typeof (this.client as any)[cmdName] !== 'function') {
            throw new Error(`Comando Redis inválido ou não suportado: "${cmdName}"`);
        }
        
        const result = await (this.client as any)[cmdName](...args);
        
        return {
            rows: Array.isArray(result) ? result.map(r => ({ value: r })) : [{ value: result }],
            executionTime: Date.now() - start
        };
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.quit();
            this.client = null;
        }
    }

    async getTables(): Promise<string[]> {
        // Para o Redis, não usamos o conceito de tabelas da mesma forma.
        // O ConnectionsProvider será adaptado para tratar Redis separadamente.
        return [];
    }

    async getSchema(): Promise<any[]> {
        return [];
    }

    async getTableDetails(tableName: string): Promise<any> {
        return null;
    }

    // Métodos específicos para Redis
    async scanKeys(cursor: string = '0', pattern: string = '*', count: number = 1000): Promise<{ cursor: string, keys: string[] }> {
        if (!this.client) { throw new Error('Redis not connected'); }
        const [newCursor, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', count);
        return { cursor: newCursor, keys };
    }

    async getKeyType(key: string): Promise<string> {
        if (!this.client) { throw new Error('Redis not connected'); }
        return await this.client.type(key);
    }

    async getKeyValue(key: string): Promise<any> {
        if (!this.client) { throw new Error('Redis not connected'); }
        const type = await this.getKeyType(key);
        switch (type) {
            case 'string': return await this.client.get(key);
            case 'list': return await this.client.lrange(key, 0, -1);
            case 'set': return await this.client.smembers(key);
            case 'zset': return await this.client.zrange(key, 0, -1, 'WITHSCORES');
            case 'hash': return await this.client.hgetall(key);
            default: return null;
        }
    }
    
    async setKeyValue(key: string, value: any, type: string): Promise<void> {
        if (!this.client) { throw new Error('Redis not connected'); }
        switch (type) {
            case 'string': 
                await this.client.set(key, value);
                break;
            case 'hash':
                // Assume value is an object for hash
                await this.client.hmset(key, value);
                break;
            // Outros tipos podem ser implementados conforme necessário
            default:
                throw new Error(`Edição para o tipo ${type} ainda não implementada.`);
        }
    }
}
