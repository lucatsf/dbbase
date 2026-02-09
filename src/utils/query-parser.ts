import * as vscode from 'vscode';

export function getQueryAtCursor(editor: vscode.TextEditor, type: 'postgres' | 'mysql' | 'redis' = 'postgres'): string {
    const selection = editor.selection;
    if (!selection.isEmpty) {
        return editor.document.getText(selection);
    }

    const doc = editor.document;
    const cursorOffset = doc.offsetAt(selection.active);
    const text = doc.getText();

    // Redis é tipicamente orientado a linha única por comando
    if (type === 'redis') {
        const lineText = doc.lineAt(selection.active.line).text.trim();
        // Se a linha for um comentário, ignoramos e não retornamos nada para o driver
        if (lineText.startsWith('--') || lineText.startsWith('#')) return '';
        return lineText;
    }

    // Lógica padrão de SQL (Blocos por ponto-e-vírgula)
    const statements = text.split(';');
    let currentOffset = 0;
    
    for (let statement of statements) {
        const start = currentOffset;
        const end = currentOffset + statement.length;
        
        if (cursorOffset >= start && cursorOffset <= end + 1) {
            return statement.trim();
        }
        currentOffset = end + 1;
    }

    return '';
}
