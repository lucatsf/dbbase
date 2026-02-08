import * as assert from 'assert';
import { DataExporter } from '../../utils/exporter';

suite('Data Exporter Unit Tests', () => {
    const data = [
        { id: 1, name: 'Lucas', active: true },
        { id: 2, name: 'AI "Copilot"', active: false }
    ];

    test('Should convert to CSV with correct escaping', () => {
        const csv = DataExporter.toCSV(data);
        assert.ok(csv.includes('id,name,active'), 'Headers missing');
        assert.ok(csv.includes('1,"Lucas",true'), 'Row 1 incorrect');
        assert.ok(csv.includes('2,"AI ""Copilot""",false'), 'Row 2 escaping incorrect');
    });

    test('Should convert to Markdown table', () => {
        const md = DataExporter.toMarkdown(data);
        assert.ok(md.includes('| id | name | active |'), 'Headers missing');
        assert.ok(md.includes('| --- | --- | --- |'), 'Separator missing');
        assert.ok(md.includes('| 1 | Lucas | true |'), 'Row 1 incorrect');
    });

    test('Should convert to SQL Inserts', () => {
        const sql = DataExporter.toSQL(data, 'users');
        assert.ok(sql.includes('INSERT INTO users (id, name, active) VALUES (1, \'Lucas\', true);'), 'SQL 1 incorrect');
        assert.ok(sql.includes('INSERT INTO users (id, name, active) VALUES (2, \'AI "Copilot"\', false);'), 'SQL 2 incorrect');
    });

    test('Should handle empty data', () => {
        assert.strictEqual(DataExporter.toCSV([]), '');
        assert.strictEqual(DataExporter.toMarkdown([]), '');
        assert.strictEqual(DataExporter.toSQL([], 't'), '');
    });
});
