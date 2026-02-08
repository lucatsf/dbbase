import * as assert from 'assert';
import { getTableHtml } from '../../utils/table-html';

suite('Table HTML Unit Tests', () => {
    test('Should return empty state when no data is provided', () => {
        const html = getTableHtml([]);
        assert.ok(html.includes('Nenhuma linha retornada'), 'Should contain empty message');
        assert.ok(html.includes('∅'), 'Should contain empty symbol');
    });

    test('Should generate table headers and data', () => {
        const data = [
            { id: 1, name: 'Lucas', role: 'Dev' },
            { id: 2, name: 'GitHub Copilot', role: 'AI' }
        ];
        const html = getTableHtml(data);
        
        // Check headers
        assert.ok(html.includes('<th>id</th>'), 'Missing id header');
        assert.ok(html.includes('<th>name</th>'), 'Missing name header');
        assert.ok(html.includes('<th>role</th>'), 'Missing role header');

        // Check data
        assert.ok(html.includes('Lucas'), 'Missing data: Lucas');
        assert.ok(html.includes('GitHub Copilot'), 'Missing data: AI');
    });

    test('Should handle special characters in data', () => {
        const data = [{ text: '<b>Bold</b>' }];
        const html = getTableHtml(data);
        // Note: Currently getTableHtml seems to inject values directly into innerText in JS, 
        // but the initial table generation might need escaping if it used innerHTML.
        // Looking at the code, it uses innerText for updates but initial table is strings.
        assert.ok(html.includes('<b>Bold</b>'), 'Should contain raw text');
    });
});
