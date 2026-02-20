import * as vscode from 'vscode';

/**
 * Divide um script SQL em múltiplas instruções (statements) individuais,
 * respeitando comentários, strings e delimitadores.
 */
export function splitSQL(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inString: string | null = null;
    let inComment: 'single' | 'multi' | null = null;
    let i = 0;

    while (i < sql.length) {
        const char = sql[i];
        const nextChar = sql[i + 1];

        // Lógica de Comentários
        if (!inString) {
            if (!inComment) {
                if (char === '-' && nextChar === '-') {
                    inComment = 'single';
                    current += char;
                    i++;
                    current += nextChar;
                    i++;
                    continue;
                }
                if (char === '#') {
                    inComment = 'single';
                    current += char;
                    i++;
                    continue;
                }
                if (char === '/' && nextChar === '*') {
                    inComment = 'multi';
                    current += char;
                    i++;
                    current += nextChar;
                    i++;
                    continue;
                }
            } else if (inComment === 'single' && (char === '\n' || char === '\r')) {
                inComment = null;
            } else if (inComment === 'multi' && char === '*' && nextChar === '/') {
                inComment = null;
                current += char;
                i++;
                current += nextChar;
                i++;
                continue;
            }
        }

        // Lógica de Strings (respeita escape)
        if (!inComment) {
            if (!inString) {
                if (char === "'" || char === '"' || char === '`') {
                    inString = char;
                }
            } else if (char === inString) {
                // Verificar escape (Ex: 'It\'s me')
                let backslashes = 0;
                let j = i - 1;
                while (j >= 0 && sql[j] === '\\') {
                    backslashes++;
                    j--;
                }
                if (backslashes % 2 === 0) {
                    inString = null;
                }
            }
        }

        // Fim de Statement (Ponto e vírgula fora de strings/comentários)
        if (char === ';' && !inString && !inComment) {
            statements.push(current.trim());
            current = '';
        } else {
            current += char;
        }

        i++;
    }

    if (current.trim()) {
        statements.push(current.trim());
    }

    return statements.filter(s => s.length > 0);
}

export function getQueryAtCursor(editor: vscode.TextEditor, type: 'postgres' | 'mysql' | 'redis' = 'postgres'): string {
    const selection = editor.selection;
    
    // Se houver seleção, retornamos o texto (será splitado depois no comando)
    if (!selection.isEmpty) {
        return editor.document.getText(selection);
    }

    // Se for Redis, mantemos a lógica de linha única por enquanto
    if (type === 'redis') {
        const lineText = editor.document.lineAt(selection.active.line).text.trim();
        return lineText.startsWith('#') ? '' : lineText;
    }

    const doc = editor.document;
    const fullText = doc.getText();
    const cursorOffset = doc.offsetAt(selection.active);

    // Parse inteligente do documento inteiro para encontrar os limites
    let currentPos = 0;
    let inString: string | null = null;
    let inComment: 'single' | 'multi' | null = null;
    let currentStatementStart = 0;
    
    // Percorremos o texto até o cursor para encontrar onde começa o bloco atual
    while (currentPos < fullText.length) {
        const char = fullText[currentPos];
        const nextChar = fullText[currentPos + 1];

        // Lógica de Comentários
        if (!inString) {
            if (!inComment) {
                if (char === '-' && nextChar === '-') {
                    inComment = 'single';
                } else if (char === '#') {
                    inComment = 'single';
                } else if (char === '/' && nextChar === '*') {
                    inComment = 'multi';
                }
            } else if (inComment === 'single' && (char === '\n' || char === '\r')) {
                inComment = null;
            } else if (inComment === 'multi' && char === '*' && nextChar === '/') {
                inComment = null;
                currentPos++; // Skip /
            }
        }

        // Lógica de Strings
        if (!inComment) {
            if (!inString) {
                if (char === "'" || char === '"' || char === '`') {
                    inString = char;
                }
            } else if (char === inString) {
                let backslashes = 0;
                let j = currentPos - 1;
                while (j >= 0 && fullText[j] === '\\') {
                    backslashes++;
                    j--;
                }
                if (backslashes % 2 === 0) {
                    inString = null;
                }
            }
        }

        // Se encontramos um ; e não estamos em string/comentário
        if (char === ';' && !inString && !inComment) {
            if (currentPos >= cursorOffset) {
                // O cursor está dentro deste bloco que acabou de fechar
                return fullText.substring(currentStatementStart, currentPos).trim();
            }
            currentStatementStart = currentPos + 1;
        }

        currentPos++;
        
        // Se passamos do cursor, precisamos continuar até encontrar o próximo ; ou o fim do arquivo
        if (currentPos >= fullText.length || (currentPos > cursorOffset && !inString && !inComment && (fullText[currentPos] === ';' || currentPos === fullText.length))) {
            break;
        }
    }

    // Se saiu do loop, o bloco é do currentStatementStart até o próximo ; ou fim
    let endPos = currentPos;
    while (endPos < fullText.length) {
        const char = fullText[endPos];
        const nextChar = fullText[endPos + 1];

        if (!inString) {
            if (!inComment) {
                if (char === '-' && nextChar === '-') {
                    inComment = 'single';
                } else if (char === '#') {
                    inComment = 'single';
                } else if (char === '/' && nextChar === '*') {
                    inComment = 'multi';
                }
            } else if (inComment === 'single' && (char === '\n' || char === '\r')) {
                inComment = null;
            } else if (inComment === 'multi' && char === '*' && nextChar === '/') {
                inComment = null;
                endPos++;
            }
        }
        if (!inComment) {
            if (!inString) {
                if (char === "'" || char === '"' || char === '`') {
                    inString = char;
                }
            } else if (char === inString) {
                let backslashes = 0;
                let j = endPos - 1;
                while (j >= 0 && fullText[j] === '\\') {
                    backslashes++;
                    j--;
                }
                if (backslashes % 2 === 0) {
                    inString = null;
                }
            }
        }

        if (char === ';' && !inString && !inComment) {
            break;
        }
        endPos++;
    }

    return fullText.substring(currentStatementStart, endPos).trim();
}
