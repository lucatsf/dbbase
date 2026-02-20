export function getTableHtml(data: any[], config?: { page: number, total?: number, limit: number, isEditable?: boolean, hasMore?: boolean }) {
    return getMultipleTablesHtml([{ rows: data, sql: '' }], config);
}

export function getMultipleTablesHtml(results: { rows: any[], sql: string }[], config?: { page: number, total?: number, limit: number, isEditable?: boolean, hasMore?: boolean }) {
    if (!results || results.length === 0 || (results.length === 1 && results[0].rows.length === 0)) {
        return `
            <body style="background:var(--vscode-editor-background);color:var(--vscode-disabledForeground);display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:sans-serif;">
                <div style="text-align:center;">
                    <div style="font-size: 2em; margin-bottom: 10px;">∅</div>
                    Query executada com sucesso. Nenhuma linha retornada.
                </div>
            </body>`;
    }

    let tablesHtml = '';
    results.forEach((res, idx) => {
        const rows = res.rows;
        const sql = res.sql;
        const headers = rows.length ? Object.keys(rows[0]) : [];

        tablesHtml += `
            <div class="result-set" style="margin-bottom: 24px;">
                ${sql ? `<div class="sql-header" style="padding: 6px 10px; background: var(--vscode-editor-inactiveSelectionBackground); font-family: var(--vscode-editor-font-family); font-size: 11px; border-left: 3px solid var(--vscode-button-background); margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.8;" title="${sql.replace(/"/g, '&quot;')}">${sql}</div>` : ''}
                <div class="table-container" style="overflow-x: auto; max-width: 100vw; border-bottom: 1px solid var(--border);">
                    <table>
                        <thead>
                            <tr>
                                <th class="row-num">#</th>
                                ${headers.map(h => `<th>${h}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map((row, i) => `
                                <tr data-row='${JSON.stringify(row).replace(/'/g, "&apos;")}'>
                                    <td class="row-num">${i + 1}</td>
                                    ${headers.map(h => {
                                        const val = row[h];
                                        const displayVal = val === null ? 'NULL' : (typeof val === 'object' ? JSON.stringify(val) : val);
                                        return `<td data-col="${h}">${displayVal}</td>`;
                                    }).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div class="info-text" style="padding: 4px 10px; font-size: 11px; opacity: 0.6; color: var(--vscode-descriptionForeground);">
                    ${rows.length} linhas retornadas
                </div>
            </div>
        `;
    });

    const lastResultData = results[results.length - 1].rows;

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            :root {
                --border: var(--vscode-panel-border);
                --header-bg: var(--vscode-sideBar-background);
                --row-hover: var(--vscode-list-hoverBackground);
                --text: var(--vscode-editor-foreground);
                --accent: var(--vscode-button-background);
                --hover-bg: var(--vscode-toolbar-hoverBackground);
                --modified-bg: rgba(234, 179, 8, 0.15);
            }
            body { 
                background: var(--vscode-editor-background); 
                color: var(--text); 
                font-family: var(--vscode-font-family, 'Segoe UI', sans-serif); 
                margin: 0; 
                padding: 0;
            }
            .container {
                display: flex;
                flex-direction: column;
                min-height: 100vh;
                width: 100vw;
            }
            .toolbar {
                padding: 0 8px;
                background: var(--header-bg);
                border-bottom: 1px solid var(--border);
                display: flex;
                justify-content: flex-start;
                align-items: center;
                gap: 2px;
                height: 32px;
                position: sticky;
                top: 0;
                z-index: 100;
            }
            .icon-btn {
                background: transparent;
                color: var(--vscode-foreground);
                border: none;
                padding: 6px;
                border-radius: 3px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0.8;
            }
            .icon-btn:hover:not(:disabled) {
                background: var(--hover-bg);
                opacity: 1;
            }
            .icon-btn:disabled {
                opacity: 0.2;
                cursor: not-allowed;
            }
            .icon-btn svg {
                width: 14px;
                height: 14px;
                fill: currentColor;
            }
            .icon-btn.save { color: var(--vscode-charts-green); }
            .icon-btn.cancel { color: var(--vscode-charts-red); }

            table { 
                border-collapse: separate; 
                border-spacing: 0;
                width: 100%; 
                font-size: 12px;
            }
            th { 
                background: var(--header-bg); 
                padding: 6px 10px; 
                text-align: left; 
                position: sticky; 
                top: 0; 
                z-index: 10;
                border-bottom: 1px solid var(--border);
                border-right: 1px solid var(--border);
                white-space: nowrap;
                font-weight: 600;
                color: var(--vscode-symbolIcon-propertyForeground);
            }
            td { 
                padding: 4px 10px; 
                border-bottom: 1px solid var(--border); 
                border-right: 1px solid var(--border);
                white-space: nowrap;
                max-width: 400px;
                overflow: hidden;
                text-overflow: ellipsis;
                cursor: cell;
            }
            td.modified {
                background: var(--modified-bg) !important;
                outline: 1px solid var(--vscode-charts-yellow);
            }
            tr:hover td {
                background: var(--row-hover);
            }
            tr.selected td {
                background: var(--vscode-list-activeSelectionBackground) !important;
                color: var(--vscode-list-activeSelectionForeground) !important;
            }
            .row-num {
                width: 30px;
                text-align: center;
                background: var(--header-bg);
                color: var(--vscode-descriptionForeground);
                font-size: 10px;
                border-right: 1px solid var(--border);
            }
            input.edit-input {
                width: 100%;
                background: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-focusBorder);
                padding: 2px 4px;
                font-family: inherit;
                font-size: inherit;
                outline: none;
            }

            .export-dropdown {
                position: relative;
                display: inline-block;
            }
            .dropdown-content {
                display: none;
                position: absolute;
                background-color: var(--header-bg);
                min-width: 120px;
                box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
                z-index: 100;
                border: 1px solid var(--border);
                border-radius: 4px;
                top: 100%;
                left: 0;
            }
            .dropdown-content a {
                color: var(--text);
                padding: 8px 12px;
                text-decoration: none;
                display: block;
                font-size: 11px;
            }
            .dropdown-content a:hover {
                background-color: var(--row-hover);
            }
            .export-dropdown:hover .dropdown-content {
                display: block;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="toolbar">
                <button id="refreshBtn" class="icon-btn refresh" title="F5 - Refresh">
                    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M4.681 3H2V2h3.5l.5.5V6H5V4a5 5 0 1 0 5 5h1a6 6 0 1 1-6.319-6z"/></svg>
                </button>
                <div style="width: 1px; height: 14px; background: var(--border); margin: 0 6px;"></div>
                <button id="saveBtn" class="icon-btn save" title="Ctrl+Enter - Apply Changes" disabled>
                    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M13.485 1.929a.75.75 0 0 1 1.06 1.06l-7.5 7.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06L6.5 8.869l6.985-6.94z"/></svg>
                </button>
                <button id="cancelBtn" class="icon-btn cancel" title="Discard Changes" disabled>
                    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M7.061 8l-2.78-2.781a.665.665 0 1 1 .94-.94L8 7.061l2.781-2.78a.665.665 0 1 1 .94.94L8.939 8l2.782 2.781a.665.665 0 1 1-.941.94L8 8.939l-2.781 2.782a.665.665 0 1 1-.94-.941L7.061 8z"/></svg>
                </button>
                <div style="width: 1px; height: 14px; background: var(--border); margin: 0 6px;"></div>
                ${config?.isEditable ? `
                <button id="addRowBtn" class="icon-btn" title="Add New Row">
                    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M14 7H9V2H7v5H2v2h5v5h2V9h5z"/></svg>
                </button>
                <button id="cloneRowBtn" class="icon-btn" title="Clone Selected Row" disabled>
                    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M4 4H1v11h11v-3h1V3L10 0H4v4zm1-3h4.6L12 3.4V11H5V1zm6 11H2V5h2v6.6l.4.4H11v1z"/></svg>
                </button>
                <button id="deleteRowBtn" class="icon-btn cancel" title="Delete Selected Row" disabled>
                    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M6.5 1h3l.5.5V2h3v1h-1v11l-.5.5h-9l-.5-.5V3h-1V2h3v-.5l.5-.5zM11 3H5v10h6V3zM6 4h1v8H6V4zm3 0h1v8H9V4z"/></svg>
                </button>
                <div style="width: 1px; height: 14px; background: var(--border); margin: 0 6px;"></div>
                ` : ''}
                <div class="export-dropdown">
                    <button id="exportBtn" class="icon-btn" title="Export Data">
                        <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.5 1h-11l-.5.5v13l.5.5h11l.5-.5v-13l-.5-.5zm-.5 13h-10V2h10v12zM4.5 9h7v1h-7V9zm7-2h-7v1h7V7zm-7-2h7v1h-7V5z"/></svg>
                        <span style="font-size: 10px; margin-left: 4px;">Export</span>
                    </button>
                    <div id="exportMenu" class="dropdown-content">
                        <a href="#" data-format="csv">CSV</a>
                        <a href="#" data-format="xlsx">Excel (XLSX)</a>
                        <a href="#" data-format="json">JSON</a>
                        <a href="#" data-format="md">Markdown</a>
                        <a href="#" data-format="sql">SQL Inserts</a>
                    </div>
                </div>
                <div style="flex-grow: 1;"></div>
                ${config ? `
                <div class="pagination" style="display: flex; align-items: center; gap: 8px; margin-right: 8px;">
                    <button id="prevBtn" class="icon-btn" title="Previous Page" ${config.page === 1 ? 'disabled' : ''}>
                        <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M10 12.7l.7-.7-4-4 4-4-.7-.7-4.7 4.7z"/></svg>
                    </button>
                    <span style="font-size: 11px; opacity: 0.8;">Page ${config.page || 1}</span>
                    <button id="nextBtn" class="icon-btn" title="Next Page" ${config.hasMore === false ? 'disabled' : ''}>
                        <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M6 12.7l-.7-.7 4-4-4-4 .7-.7 4.7 4.7z"/></svg>
                    </button>
                </div>
                ` : ''}
            </div>
            <div id="main-content" style="padding: 10px;">
                ${tablesHtml}
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            let pendingChanges = [];
            let currentSelectedRow = null;
            const saveBtn = document.getElementById('saveBtn');
            const cancelBtn = document.getElementById('cancelBtn');
            const refreshBtn = document.getElementById('refreshBtn');
            const addRowBtn = document.getElementById('addRowBtn');
            const cloneRowBtn = document.getElementById('cloneRowBtn');
            const deleteRowBtn = document.getElementById('deleteRowBtn');
            const prevBtn = document.getElementById('prevBtn');
            const nextBtn = document.getElementById('nextBtn');

            // Selection Logic
            document.addEventListener('click', (e) => {
                const tr = e.target.closest('tr');
                if (tr && tr.parentElement.tagName === 'TBODY') {
                    if (currentSelectedRow) currentSelectedRow.classList.remove('selected');
                    currentSelectedRow = tr;
                    tr.classList.add('selected');
                    if (cloneRowBtn) cloneRowBtn.disabled = false;
                    if (deleteRowBtn) deleteRowBtn.disabled = false;
                } else if (!e.target.closest('.icon-btn')) {
                    if (currentSelectedRow) currentSelectedRow.classList.remove('selected');
                    currentSelectedRow = null;
                    if (cloneRowBtn) cloneRowBtn.disabled = true;
                    if (deleteRowBtn) deleteRowBtn.disabled = true;
                }
            });

            // Delegated double click for editing
            document.addEventListener('dblclick', (e) => {
                const td = e.target.closest('td');
                if (!td || td.classList.contains('row-num')) return;
                if (td.querySelector('input')) return;

                const originalValue = td.innerText === 'NULL' ? '' : td.innerText;
                const colName = td.getAttribute('data-col');
                const rowData = JSON.parse(td.parentElement.getAttribute('data-row'));

                const input = document.createElement('input');
                input.className = 'edit-input';
                input.value = originalValue;
                
                td.innerText = '';
                td.appendChild(input);
                input.focus();

                input.onblur = () => finishEdit(td, input, originalValue, colName, rowData);
                input.onkeydown = (ke) => {
                    if (ke.key === 'Enter') input.blur();
                    if (ke.key === 'Escape') {
                        td.innerText = originalValue === '' ? 'NULL' : originalValue;
                    }
                };
            });

            function finishEdit(td, input, originalValue, colName, rowData) {
                const newValue = input.value;
                td.innerText = newValue === '' ? 'NULL' : newValue;
                
                if (newValue !== originalValue) {
                    td.classList.add('modified');
                    pendingChanges.push({
                        column: colName,
                        value: newValue,
                        rowData: rowData,
                        element: td,
                        oldValue: originalValue
                    });
                    saveBtn.disabled = false;
                    cancelBtn.disabled = false;
                }
            }

            const doSave = () => {
                // Handle modified cells in existing rows
                pendingChanges.forEach(change => {
                    if (change.rowData && Object.keys(change.rowData).length > 0) {
                        vscode.postMessage({
                            command: 'updateCell',
                            data: {
                                column: change.column,
                                value: change.value,
                                rowData: change.rowData
                            }
                        });
                    }
                    change.element.classList.remove('modified');
                });

                // Handle new rows (Add/Clone)
                document.querySelectorAll('tr').forEach(tr => {
                    const rowDataAttr = tr.getAttribute('data-row');
                    if (rowDataAttr === '{}' || tr.classList.contains('modified-row') || tr.classList.contains('new-row-rascunho')) {
                        const newRowData = {};
                        tr.querySelectorAll('td[data-col]').forEach(td => {
                            const col = td.getAttribute('data-col');
                            const val = td.innerText === 'NULL' ? null : td.innerText;
                            newRowData[col] = val;
                        });

                        vscode.postMessage({
                            command: 'addRow',
                            rowData: newRowData
                        });
                        tr.classList.remove('modified-row');
                        tr.classList.remove('new-row-rascunho');
                        tr.querySelectorAll('.modified').forEach(td => td.classList.remove('modified'));
                    }
                });

                pendingChanges = [];
                saveBtn.disabled = true;
                cancelBtn.disabled = true;
            };

            const doCancel = () => {
                // Restore original values for modified cells
                pendingChanges.forEach(change => {
                    change.element.innerText = change.oldValue === '' ? 'NULL' : change.oldValue;
                    change.element.classList.remove('modified');
                });

                // Remove newly added/cloned rows that haven't been saved
                document.querySelectorAll('tr.new-row-rascunho, tr.modified-row').forEach(tr => {
                    tr.remove();
                });

                pendingChanges = [];
                saveBtn.disabled = true;
                cancelBtn.disabled = true;
            };

            saveBtn.onclick = doSave;
            cancelBtn.onclick = doCancel;
            refreshBtn.onclick = () => vscode.postMessage({ command: 'refresh' });

            if (addRowBtn) addRowBtn.onclick = () => {
                const tbody = document.querySelector('tbody');
                const firstRow = tbody.querySelector('tr');
                if (!firstRow) return;
                
                const newRow = firstRow.cloneNode(true);
                newRow.classList.remove('selected');
                newRow.classList.add('new-row-rascunho');
                newRow.setAttribute('data-row', '{}');
                newRow.querySelectorAll('td').forEach((td, i) => {
                    if (td.classList.contains('row-num')) {
                        td.innerText = '*';
                    } else {
                        td.innerText = 'NULL';
                        td.classList.add('modified');
                    }
                });
                tbody.prepend(newRow);
                saveBtn.disabled = false;
                cancelBtn.disabled = false;
            };

            if (cloneRowBtn) cloneRowBtn.onclick = () => {
                if (!currentSelectedRow) return;
                const newRow = currentSelectedRow.cloneNode(true);
                newRow.classList.remove('selected');
                newRow.classList.add('modified-row'); // Mark as new for clonning
                newRow.querySelectorAll('td').forEach(td => {
                    if (td.classList.contains('row-num')) {
                        td.innerText = '*';
                    } else if (!td.classList.contains('row-num')) {
                        td.classList.add('modified');
                    }
                });
                currentSelectedRow.after(newRow);
                saveBtn.disabled = false;
                cancelBtn.disabled = false;
            };

            if (deleteRowBtn) deleteRowBtn.onclick = () => {
                if (!currentSelectedRow) return;
                
                // Se for uma linha nova que ainda não foi salva no banco, apenas removemos do DOM
                if (currentSelectedRow.classList.contains('new-row-rascunho') || currentSelectedRow.classList.contains('modified-row')) {
                    currentSelectedRow.remove();
                    currentSelectedRow = null;
                    cloneRowBtn.disabled = true;
                    deleteRowBtn.disabled = true;
                    
                    // Se não houver mais nada modificado, podemos desabilitar o salvar/cancelar
                    const remains = document.querySelectorAll('.modified, .new-row-rascunho, .modified-row');
                    if (remains.length === 0) {
                        saveBtn.disabled = true;
                        cancelBtn.disabled = true;
                    }
                    return;
                }

                const rowData = JSON.parse(currentSelectedRow.getAttribute('data-row'));
                vscode.postMessage({
                    command: 'deleteRow',
                    rowData: rowData
                });
            };

            if (prevBtn) prevBtn.onclick = () => vscode.postMessage({ command: 'prevPage' });
            if (nextBtn) nextBtn.onclick = () => vscode.postMessage({ command: 'nextPage' });

            // Export logic - Exports the LAST result set
            document.querySelectorAll('.dropdown-content a').forEach(item => {
                item.addEventListener('click', event => {
                    const format = event.target.getAttribute('data-format');
                    const dataToExport = ${JSON.stringify(lastResultData)};
                    vscode.postMessage({ 
                        command: 'exportData', 
                        format: format,
                        data: dataToExport 
                    });
                });
            });

            window.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'Enter') doSave();
            });
        </script>
    </body>
    </html>`;
}
