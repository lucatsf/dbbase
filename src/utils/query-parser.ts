import * as vscode from 'vscode';

export function getQueryAtCursor(editor: vscode.TextEditor): string {
    const selection = editor.selection;
    if (!selection.isEmpty) {
        return editor.document.getText(selection);
    }

    const text = editor.document.getText();
    const cursorOffset = editor.document.offsetAt(selection.active);

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
