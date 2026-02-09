import * as vscode from 'vscode';

export function getQueryAtCursor(editor: vscode.TextEditor, type: 'postgres' | 'mysql' | 'redis' = 'postgres'): string {
    const selection = editor.selection;
    if (!selection.isEmpty) {
        return editor.document.getText(selection);
    }

    const doc = editor.document;
    const cursorLine = selection.active.line;

    // 1. Verificar se a linha atual é um comentário (ignoramos para não executar lixo)
    const lineText = doc.lineAt(cursorLine).text.trim();
    if (lineText.startsWith('--') || lineText.startsWith('#')) {
        return '';
    }

    // 2. Lógica de Detecção de Bloco Inteligente
    // Subimos até encontrar uma linha vazia ou uma linha que termina com ponto-e-vírgula (bloco anterior)
    let startLine = cursorLine;
    while (startLine > 0) {
        const prevLine = doc.lineAt(startLine - 1).text.trim();
        if (prevLine === '' || prevLine.endsWith(';')) {
            break;
        }
        startLine--;
    }

    // Descemos até encontrar uma linha vazia ou uma linha que termina com ponto-e-vírgula (fim do bloco atual)
    let endLine = cursorLine;
    while (endLine < doc.lineCount - 1) {
        const currentLine = doc.lineAt(endLine).text.trim();
        if (currentLine === '' || currentLine.endsWith(';')) {
            break;
        }
        endLine++;
    }

    const range = new vscode.Range(
        new vscode.Position(startLine, 0),
        doc.lineAt(endLine).range.end
    );

    return doc.getText(range).trim();
}
