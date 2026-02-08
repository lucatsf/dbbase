export class DataExporter {
    static toCSV(data: any[]): string {
        if (!data || data.length === 0) return '';
        const headers = Object.keys(data[0]);
        const csvRows = [headers.join(',')];
        data.forEach(row => {
            const values = headers.map(h => {
                const val = row[h];
                return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val;
            });
            csvRows.push(values.join(','));
        });
        return csvRows.join('\n');
    }

    static toMarkdown(data: any[]): string {
        if (!data || data.length === 0) return '';
        const headers = Object.keys(data[0]);
        const mdRows = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`];
        data.forEach(row => {
            mdRows.push(`| ${headers.map(h => row[h]).join(' | ')} |`);
        });
        return mdRows.join('\n');
    }

    static toSQL(data: any[], tableName: string): string {
        if (!data || data.length === 0) return '';
        const headers = Object.keys(data[0]);
        const sqlRows = data.map(row => {
            const cols = headers.join(', ');
            const vals = headers.map(h => {
                const val = row[h];
                if (val === null) return 'NULL';
                return typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : val;
            }).join(', ');
            return `INSERT INTO ${tableName} (${cols}) VALUES (${vals});`;
        });
        return sqlRows.join('\n');
    }
}
