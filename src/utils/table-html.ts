export function getTableHtml(data: any[]) {
    if (!data.length) {
        return `
            <body style="background:var(--vscode-editor-background);color:var(--vscode-disabledForeground);display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:sans-serif;">
                <div style="text-align:center;">
                    <div style="font-size: 2em; margin-bottom: 10px;">∅</div>
                    Query executada com sucesso. Nenhuma linha retornada.
                </div>
            </body>`;
    }

    const headers = Object.keys(data[0]);

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
                overflow: hidden;
            }
            .container {
                display: flex;
                flex-direction: column;
                height: 100vh;
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
            }
            .info-text {
                font-size: 11px;
                color: var(--vscode-descriptionForeground);
                margin-left: auto;
                padding-right: 8px;
                display: flex;
                gap: 12px;
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
            .icon-btn.refresh { color: var(--vscode-foreground); }

            .table-container {
                flex: 1;
                overflow: auto;
                position: relative;
            }
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
                max-width: 300px;
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

            /* Dropdown Menu */
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
                <button id="refreshBtn" class="icon-btn refresh" title="F5 - Atualizar">
                    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M4.681 3H2V2h3.5l.5.5V6H5V4a5 5 0 1 0 5 5h1a6 6 0 1 1-6.319-6z"/></svg>
                </button>
                <div style="width: 1px; height: 14px; background: var(--border); margin: 0 6px;"></div>
                <button id="saveBtn" class="icon-btn save" title="Ctrl+Enter - Aplicar Alterações" disabled>
                    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M13.485 1.929a.75.75 0 0 1 1.06 1.06l-7.5 7.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06L6.5 8.869l6.985-6.94z"/></svg>
                </button>
                <button id="cancelBtn" class="icon-btn cancel" title="Descartar Alterações" disabled>
                    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M7.061 8l-2.78-2.781a.665.665 0 1 1 .94-.94L8 7.061l2.781-2.78a.665.665 0 1 1 .94.94L8.939 8l2.782 2.781a.665.665 0 1 1-.941.94L8 8.939l-2.781 2.782a.665.665 0 1 1-.94-.941L7.061 8z"/></svg>
                </button>
                <div style="width: 1px; height: 14px; background: var(--border); margin: 0 6px;"></div>
                <div class="export-dropdown">
                    <button id="exportBtn" class="icon-btn" title="Exportar Dados">
                        <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M13.5 1h-11l-.5.5v13l.5.5h11l.5-.5v-13l-.5-.5zm-.5 13h-10V2h10v12zM4.5 9h7v1h-7V9zm7-2h-7v1h7V7zm-7-2h7v1h-7V5z"/></svg>
                        <span style="font-size: 10px; margin-left: 4px;">Export</span>
                    </button>
                    <div id="exportMenu" class="dropdown-content">
                        <a href="#" data-format="csv">CSV</a>
                        <a href="#" data-format="json">JSON</a>
                        <a href="#" data-format="xlsx">Excel (XLSX)</a>
                        <a href="#" data-format="md">Markdown</a>
                        <a href="#" data-format="sql">SQL Inserts</a>
                    </div>
                </div>
                <div class="info-text">
                    <span id="rowCount">${data.length} rows</span>
                </div>
            </div>
            <div class="table-container">
                <table id="resultsTable">
                    <thead>
                        <tr>
                            <th class="row-num">#</th>
                            ${headers.map(h => `<th>${h}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map((r, i) => `
                            <tr data-row='${JSON.stringify(r).replace(/'/g, "&apos;")}'>
                                <td class="row-num">${i + 1}</td>
                                ${headers.map(h => {
                                    const val = r[h];
                                    const displayVal = val === null ? 'NULL' : (typeof val === 'object' ? JSON.stringify(val) : val);
                                    return `<td data-col="${h}">${displayVal}</td>`;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            const table = document.getElementById('resultsTable');
            const saveBtn = document.getElementById('saveBtn');
            const cancelBtn = document.getElementById('cancelBtn');
            const refreshBtn = document.getElementById('refreshBtn');
            let pendingChanges = [];

            table.addEventListener('dblclick', (e) => {
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
                if (pendingChanges.length === 0) return;
                
                pendingChanges.forEach(change => {
                    vscode.postMessage({
                        command: 'updateCell',
                        data: {
                            column: change.column,
                            value: change.value,
                            rowData: change.rowData
                        }
                    });
                    change.element.classList.remove('modified');
                });

                pendingChanges = [];
                saveBtn.disabled = true;
                cancelBtn.disabled = true;
            };

            const doCancel = () => {
                pendingChanges.forEach(change => {
                    change.element.innerText = change.oldValue === '' ? 'NULL' : change.oldValue;
                    change.element.classList.remove('modified');
                });
                pendingChanges = [];
                saveBtn.disabled = true;
                cancelBtn.disabled = true;
            };

            saveBtn.onclick = doSave;
            cancelBtn.onclick = doCancel;
            refreshBtn.onclick = () => vscode.postMessage({ command: 'refresh' });

            // Export logic
            document.querySelectorAll('.dropdown-content a').forEach(item => {
                item.addEventListener('click', event => {
                    const format = event.target.getAttribute('data-format');
                    vscode.postMessage({ 
                        command: 'exportData', 
                        format: format,
                        data: ${JSON.stringify(data)} 
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
