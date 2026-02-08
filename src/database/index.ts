import { Connection } from '../types';
import { IDatabaseDriver } from './driver';
import { PostgresDriver } from './postgres';
import { MySQLDriver } from './mysql';

export class DriverFactory {
    static create(config: Connection): IDatabaseDriver {
        switch (config.type) {
            case 'postgres':
                return new PostgresDriver(config);
            case 'mysql':
                return new MySQLDriver(config);
            default:
                throw new Error(`Driver not supported: ${config.type}`);
        }
    }
}
