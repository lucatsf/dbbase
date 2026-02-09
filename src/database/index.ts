import { Connection } from '../types';
import { IDatabaseDriver } from './driver';
import { PostgresDriver } from './postgres';
import { MySQLDriver } from './mysql';
import { RedisDriver } from './redis';

export class DriverFactory {
    static create(config: Connection): IDatabaseDriver {
        switch (config.type) {
            case 'postgres':
                return new PostgresDriver(config);
            case 'mysql':
                return new MySQLDriver(config);
            case 'redis':
                return new RedisDriver(config);
            default:
                throw new Error(`Driver not supported: ${config.type}`);
        }
    }
}
