import * as assert from 'assert';
import { DriverFactory } from '../../database';
import { PostgresDriver } from '../../database/postgres';
import { MySQLDriver } from '../../database/mysql';
import { Connection } from '../../types';

suite('Driver Factory Unit Tests', () => {
    const pgConfig: Connection = {
        id: '1',
        type: 'postgres',
        label: 'PG',
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: '',
        database: 'postgres'
    };

    const mysqlConfig: Connection = {
        id: '2',
        type: 'mysql',
        label: 'MySQL',
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: '',
        database: 'mysql'
    };

    test('Should create PostgresDriver', () => {
        const driver = DriverFactory.create(pgConfig);
        assert.ok(driver instanceof PostgresDriver, 'Should be PostgresDriver');
    });

    test('Should create MySQLDriver', () => {
        const driver = DriverFactory.create(mysqlConfig);
        assert.ok(driver instanceof MySQLDriver, 'Should be MySQLDriver');
    });

    test('Should throw error for unknown driver type', () => {
        const unknownConfig = { ...pgConfig, type: 'sqlite' as any };
        assert.throws(() => DriverFactory.create(unknownConfig), /Driver not supported: sqlite/);
    });
});
