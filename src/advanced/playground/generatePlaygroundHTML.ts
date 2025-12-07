import { PlaygroundConfig } from './types';



export function generatePlaygroundHTML(config: PlaygroundConfig, baseUrl: string): string {
    const isDark = config.theme === 'dark';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.title}</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'></text></svg>">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs/editor/editor.main.css">
    
    <style>
        :root {
            --bg-primary: ${isDark ? '#0d1117' : '#ffffff'};
            --bg-secondary: ${isDark ? '#161b22' : '#f6f8fa'};
            --bg-tertiary: ${isDark ? '#21262d' : '#eaeef2'};
            --text-primary: ${isDark ? '#e6edf3' : '#1f2328'};
            --text-secondary: ${isDark ? '#8b949e' : '#656d76'};
            --text-muted: ${isDark ? '#6e7681' : '#8c959f'};
            --border-color: ${isDark ? '#30363d' : '#d0d7de'};
            --accent-color: #2f81f7;
            --accent-hover: #1f6feb;
            --success-color: #3fb950;
            --error-color: #f85149;
            --method-get: #3fb950;
            --method-post: #2f81f7;
            --method-put: #d29922;
            --method-patch: #a371f7;
            --method-delete: #f85149;
            --sidebar-width: 320px;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            height: 100vh;
            overflow: hidden;
        }

        .app { display: flex; height: 100vh; }

        /* Sidebar */
        .sidebar {
            width: var(--sidebar-width);
            min-width: 60px;
            background: var(--bg-secondary);
            border-right: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
            transition: width 0.3s ease;
            position: relative;
        }

        .sidebar.collapsed {
            width: 60px;
        }

        .sidebar.collapsed .sidebar-content { display: none; }
        .sidebar.collapsed .collapse-btn { transform: rotate(180deg); }

        .sidebar-header {
            padding: 12px 16px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            gap: 10px;
            min-height: 52px;
        }

        .sidebar-header h1 {
            font-size: 15px;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
        }

        .sidebar.collapsed .sidebar-header h1 { display: none; }

        .logo { font-size: 22px; flex-shrink: 0; }

        .collapse-btn {
            margin-left: auto;
            padding: 6px;
            border: none;
            background: transparent;
            color: var(--text-secondary);
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.2s;
            font-size: 16px;
        }

        .collapse-btn:hover { background: var(--bg-tertiary); color: var(--text-primary); }

        .sidebar-content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

        .search-box { padding: 12px; border-bottom: 1px solid var(--border-color); }

        .search-input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: var(--bg-primary);
            color: var(--text-primary);
            font-size: 13px;
            outline: none;
        }

        .search-input:focus { border-color: var(--accent-color); }
        .search-input::placeholder { color: var(--text-muted); }

        .endpoints-list { flex: 1; overflow-y: auto; padding: 8px 0; }

        .endpoint-group { margin-bottom: 2px; }

        .endpoint-group-header {
            padding: 8px 12px;
            font-size: 11px;
            font-weight: 600;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            user-select: none;
        }

        .endpoint-group-header:hover { background: var(--bg-tertiary); }
        .endpoint-group-header .arrow { transition: transform 0.2s; font-size: 10px; }
        .endpoint-group.collapsed .arrow { transform: rotate(-90deg); }
        .endpoint-group.collapsed .endpoint-group-items { display: none; }

        .endpoint-item {
            padding: 8px 12px 8px 20px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: background 0.15s;
            border-left: 3px solid transparent;
        }

        .endpoint-item:hover { background: var(--bg-tertiary); }
        .endpoint-item.active { background: var(--bg-tertiary); border-left-color: var(--accent-color); }
        .endpoint-item.deprecated { opacity: 0.5; text-decoration: line-through; }

        .method-badge {
            font-size: 9px;
            font-weight: 700;
            padding: 2px 5px;
            border-radius: 3px;
            text-transform: uppercase;
            min-width: 44px;
            text-align: center;
        }

        .method-badge.get { background: var(--method-get); color: #000; }
        .method-badge.post { background: var(--method-post); color: #fff; }
        .method-badge.put { background: var(--method-put); color: #000; }
        .method-badge.patch { background: var(--method-patch); color: #fff; }
        .method-badge.delete { background: var(--method-delete); color: #fff; }

        .endpoint-path {
            font-size: 12px;
            font-family: 'SF Mono', 'Fira Code', monospace;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* Main */
        .main { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }

        /* Request Section */
        .request-section {
            display: flex;
            flex-direction: column;
            border-bottom: 1px solid var(--border-color);
            height: 30%;
            min-height: 150px;
        }

        .request-header {
            padding: 10px 16px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            gap: 10px;
            flex-shrink: 0;
        }

        .url-bar {
            flex: 1;
            display: flex;
            align-items: center;
            gap: 6px;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 3px;
        }

        .method-select {
            padding: 7px 10px;
            border: none;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            outline: none;
            background: var(--method-get);
            color: #000;
            min-width: 80px;
        }

        .url-input {
            flex: 1;
            padding: 7px 10px;
            border: none;
            background: transparent;
            color: var(--text-primary);
            font-size: 13px;
            font-family: 'SF Mono', 'Fira Code', monospace;
            outline: none;
        }

        .send-btn {
            padding: 7px 16px;
            background: var(--accent-color);
            color: #fff;
            border: none;
            border-radius: 5px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: background 0.2s;
        }

        .send-btn:hover { background: var(--accent-hover); }
        .send-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .spinner {
            width: 12px;
            height: 12px;
            border: 2px solid rgba(255,255,255,0.3);
            border-top-color: #fff;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            display: none;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .tabs {
            display: flex;
            padding: 0 16px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            flex-shrink: 0;
        }

        .tab {
            padding: 10px 14px;
            font-size: 12px;
            font-weight: 500;
            color: var(--text-secondary);
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
        }

        .tab:hover { color: var(--text-primary); }
        .tab.active { color: var(--text-primary); border-bottom-color: var(--accent-color); }

        .tab-badge {
            margin-left: 4px;
            padding: 1px 5px;
            font-size: 10px;
            background: var(--bg-tertiary);
            border-radius: 8px;
        }

        .editor-container { flex: 1; display: flex; overflow: hidden; }
        .editor-wrapper { flex: 1; display: none; overflow: hidden; }
        .editor-wrapper.active { display: flex; flex-direction: column; }
        .editor { flex: 1; }

        .params-editor { padding: 12px 16px; overflow-y: auto; height: 100%; }

        .param-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
        }

        .param-checkbox { width: 16px; height: 16px; accent-color: var(--accent-color); }

        .param-input {
            flex: 1;
            padding: 8px 10px;
            border: 1px solid var(--border-color);
            border-radius: 5px;
            background: var(--bg-primary);
            color: var(--text-primary);
            font-size: 12px;
            font-family: 'SF Mono', 'Fira Code', monospace;
            outline: none;
        }

        .param-input:focus { border-color: var(--accent-color); }
        .param-input.key { max-width: 160px; }

        .param-delete {
            padding: 6px;
            border: none;
            background: transparent;
            color: var(--text-muted);
            cursor: pointer;
            border-radius: 3px;
        }

        .param-delete:hover { background: var(--error-color); color: #fff; }

        .add-param-btn {
            padding: 6px 12px;
            border: 1px dashed var(--border-color);
            background: transparent;
            color: var(--text-secondary);
            border-radius: 5px;
            cursor: pointer;
            font-size: 12px;
        }

        .add-param-btn:hover { border-color: var(--accent-color); color: var(--accent-color); }

        /* Info Panel */
        .info-panel {
            padding: 16px;
            overflow-y: auto;
            height: 100%;
        }

        .info-empty {
            color: var(--text-muted);
            font-size: 13px;
            text-align: center;
            padding: 24px;
        }

        .info-section {
            margin-bottom: 16px;
        }

        .info-section:last-child {
            margin-bottom: 0;
        }

        .info-label {
            font-size: 10px;
            font-weight: 600;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
        }

        .info-value {
            font-size: 13px;
            color: var(--text-primary);
            line-height: 1.5;
        }

        .info-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }

        .info-tag {
            padding: 3px 8px;
            background: var(--accent-color);
            color: #fff;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
        }

        .info-deprecated {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            background: rgba(248,81,73,0.15);
            color: var(--error-color);
            border-radius: 6px;
            font-size: 12px;
            font-weight: 500;
        }

        .info-responses {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .info-response-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 10px;
            background: var(--bg-tertiary);
            border-radius: 6px;
        }

        .info-response-code {
            font-family: 'SF Mono', 'Fira Code', monospace;
            font-size: 12px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 4px;
            min-width: 40px;
            text-align: center;
        }

        .info-response-code.success { background: rgba(63,185,80,0.2); color: var(--success-color); }
        .info-response-code.redirect { background: rgba(47,129,247,0.2); color: var(--accent-color); }
        .info-response-code.client-error { background: rgba(210,153,34,0.2); color: #d29922; }
        .info-response-code.server-error { background: rgba(248,81,73,0.2); color: var(--error-color); }

        .info-response-desc {
            font-size: 12px;
            color: var(--text-secondary);
        }

        .info-method-path {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            background: var(--bg-tertiary);
            border-radius: 6px;
            margin-bottom: 16px;
        }

        .info-method-path .method-badge {
            font-size: 11px;
            padding: 4px 8px;
        }

        .info-method-path .path {
            font-family: 'SF Mono', 'Fira Code', monospace;
            font-size: 13px;
            color: var(--text-primary);
        }

        .info-label-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 6px;
        }

        .info-label-row .info-label {
            margin-bottom: 0;
        }

        .info-use-btn {
            padding: 4px 10px;
            background: var(--accent-color);
            color: #fff;
            border: none;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .info-use-btn:hover {
            background: var(--accent-hover);
        }

        .info-use-btn.copied {
            background: var(--success-color);
        }

        .info-example-code {
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 12px;
            font-family: 'SF Mono', 'Fira Code', monospace;
            font-size: 12px;
            color: var(--text-primary);
            overflow-x: auto;
            white-space: pre;
            margin: 0;
            line-height: 1.5;
        }

        /* Resizer */
        .resizer {
            height: 6px;
            background: var(--bg-secondary);
            cursor: row-resize;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border-top: 1px solid var(--border-color);
            border-bottom: 1px solid var(--border-color);
        }

        .resizer:hover { background: var(--accent-color); }

        .resizer-handle {
            width: 40px;
            height: 3px;
            background: var(--border-color);
            border-radius: 2px;
        }

        .resizer:hover .resizer-handle { background: #fff; }

        /* Response Section */
        .response-section {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 150px;
            overflow: hidden;
        }

        .response-header {
            padding: 10px 16px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            gap: 12px;
            flex-shrink: 0;
        }

        .response-header h3 { font-size: 13px; font-weight: 600; }

        .response-status {
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
            display: none;
        }

        .response-status.success { display: inline; background: rgba(63,185,80,0.2); color: var(--success-color); }
        .response-status.error { display: inline; background: rgba(248,81,73,0.2); color: var(--error-color); }

        .response-meta { font-size: 12px; color: var(--text-secondary); margin-left: auto; }

        .response-tabs {
            display: flex;
            padding: 0 16px;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            flex-shrink: 0;
        }

        .response-tab {
            padding: 8px 14px;
            font-size: 12px;
            font-weight: 500;
            color: var(--text-secondary);
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
        }

        .response-tab:hover { color: var(--text-primary); }
        .response-tab.active { color: var(--text-primary); border-bottom-color: var(--accent-color); }

        .response-tab-badge {
            margin-left: 4px;
            padding: 1px 5px;
            font-size: 10px;
            background: var(--bg-tertiary);
            border-radius: 8px;
        }

        .response-body { flex: 1; overflow: hidden; position: relative; display: flex; flex-direction: column; }

        .response-content { flex: 1; display: none; overflow: hidden; }
        .response-content.active { display: flex; flex-direction: column; }

        #responseEditor, #responseRawEditor, #responseHeadersEditor { flex: 1; min-height: 100px; }

        .empty-state {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: var(--text-muted);
            gap: 12px;
        }

        .empty-state .icon { font-size: 40px; opacity: 0.5; }
        .empty-state p { font-size: 13px; text-align: center; }

        .keyboard-hint {
            position: fixed;
            bottom: 16px;
            right: 16px;
            padding: 6px 10px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-color);
            border-radius: 5px;
            font-size: 11px;
            color: var(--text-secondary);
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .keyboard-hint kbd {
            padding: 2px 5px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 3px;
            font-family: 'SF Mono', monospace;
            font-size: 10px;
        }

        /* API Tabs */
        .api-tabs-container {
            display: flex;
            background: var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            overflow-x: auto;
            flex-shrink: 0;
            min-height: 36px;
        }

        .api-tabs-container::-webkit-scrollbar { height: 4px; }
        .api-tabs-container::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 2px; }

        .api-tab {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 12px;
            border-right: 1px solid var(--border-color);
            cursor: pointer;
            background: var(--bg-tertiary);
            transition: background 0.15s;
            min-width: 120px;
            max-width: 220px;
            position: relative;
        }

        .api-tab:hover { background: var(--bg-secondary); }
        .api-tab.active { 
            background: var(--bg-primary); 
            border-bottom: 2px solid var(--accent-color);
            margin-bottom: -1px;
        }

        .api-tab-method {
            font-size: 9px;
            font-weight: 700;
            padding: 2px 4px;
            border-radius: 3px;
            text-transform: uppercase;
            flex-shrink: 0;
        }

        .api-tab-method.get { background: var(--method-get); color: #000; }
        .api-tab-method.post { background: var(--method-post); color: #fff; }
        .api-tab-method.put { background: var(--method-put); color: #000; }
        .api-tab-method.patch { background: var(--method-patch); color: #fff; }
        .api-tab-method.delete { background: var(--method-delete); color: #fff; }

        .api-tab-path {
            font-size: 11px;
            font-family: 'SF Mono', 'Fira Code', monospace;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex: 1;
        }

        .api-tab-close {
            padding: 2px 5px;
            border: none;
            background: transparent;
            color: var(--text-muted);
            cursor: pointer;
            border-radius: 3px;
            font-size: 14px;
            line-height: 1;
            opacity: 0;
            transition: all 0.15s;
        }

        .api-tab:hover .api-tab-close { opacity: 1; }
        .api-tab-close:hover { background: var(--error-color); color: #fff; }

        .api-tab-add {
            padding: 8px 14px;
            border: none;
            background: transparent;
            color: var(--text-secondary);
            cursor: pointer;
            font-size: 16px;
            transition: all 0.15s;
            flex-shrink: 0;
        }

        .api-tab-add:hover { background: var(--bg-tertiary); color: var(--text-primary); }

        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
    </style>
</head>
<body>
    <div class="app">
        <aside class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <span class="logo"></span>
                <h1>${config.title}</h1>
                <button class="collapse-btn" onclick="toggleSidebar()" title="Toggle sidebar">◀</button>
            </div>
            <div class="sidebar-content">
                <div class="search-box">
                    <input type="text" class="search-input" placeholder="Search..." id="searchInput" onkeyup="filterEndpoints()">
                </div>
                <div class="endpoints-list" id="endpointsList"></div>
            </div>
        </aside>

        <main class="main">
            <div class="api-tabs-container" id="apiTabs"></div>

            <section class="request-section" id="requestSection">
                <div class="request-header">
                    <div class="url-bar">
                        <select class="method-select" id="methodSelect" onchange="updateMethodColor()">
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                            <option value="PATCH">PATCH</option>
                            <option value="DELETE">DELETE</option>
                        </select>
                        <input type="text" class="url-input" id="urlInput" placeholder="Enter URL" value="${baseUrl}/" onchange="updateCurrentTabLabel()" onblur="updateCurrentTabLabel()">
                    </div>
                    <button class="send-btn" id="sendBtn" onclick="sendRequest()">
                        <span id="sendBtnText">Send</span>
                        <span class="spinner" id="spinner"></span>
                    </button>
                </div>

                <div class="tabs">
                    <div class="tab active" data-tab="body" onclick="switchTab('body')">Body</div>
                    <div class="tab" data-tab="params" onclick="switchTab('params')">Params <span class="tab-badge" id="paramsCount">0</span></div>
                    <div class="tab" data-tab="headers" onclick="switchTab('headers')">Headers <span class="tab-badge" id="headersCount">1</span></div>
                    <div class="tab" data-tab="info" onclick="switchTab('info')">Info</div>
                </div>

                <div class="editor-container">
                    <div class="editor-wrapper active" id="bodyTab">
                        <div class="editor" id="requestEditor"></div>
                    </div>
                    <div class="editor-wrapper" id="paramsTab">
                        <div class="params-editor" id="paramsEditor"></div>
                    </div>
                    <div class="editor-wrapper" id="headersTab">
                        <div class="params-editor" id="headersEditor"></div>
                    </div>
                    <div class="editor-wrapper" id="infoTab">
                        <div class="info-panel" id="infoPanel">
                            <div class="info-empty">Select an endpoint to view its information</div>
                        </div>
                    </div>
                </div>
            </section>

            <div class="resizer" id="resizer">
                <div class="resizer-handle"></div>
            </div>

            <section class="response-section" id="responseSection">
                <div class="response-header">
                    <h3>Response</h3>
                    <span class="response-status" id="responseStatus"></span>
                    <span class="response-meta" id="responseMeta"></span>
                </div>
                <div class="response-tabs" id="responseTabs" style="display:none;">
                    <div class="response-tab active" data-restab="json" onclick="switchResponseTab('json')">JSON</div>
                    <div class="response-tab" data-restab="raw" onclick="switchResponseTab('raw')">Raw</div>
                    <div class="response-tab" data-restab="headers" onclick="switchResponseTab('headers')">Headers <span class="response-tab-badge" id="resHeadersCount">0</span></div>
                </div>
                <div class="response-body">
                    <div class="empty-state" id="emptyResponse">
                        <span class="icon">📡</span>
                        <p>Click "Send" or press Ctrl+Enter</p>
                    </div>
                    <div class="response-content active" id="jsonContent">
                        <div class="editor" id="responseEditor"></div>
                    </div>
                    <div class="response-content" id="rawContent">
                        <div class="editor" id="responseRawEditor"></div>
                    </div>
                    <div class="response-content" id="headersContent">
                        <div class="editor" id="responseHeadersEditor"></div>
                    </div>
                </div>
            </section>
        </main>
    </div>

    <div class="keyboard-hint">
        <kbd>Ctrl</kbd>+<kbd>Enter</kbd> Send &nbsp;|&nbsp;
        <kbd>Ctrl</kbd>+<kbd>T</kbd> New Tab &nbsp;|&nbsp;
        <kbd>Ctrl</kbd>+<kbd>W</kbd> Close Tab &nbsp;|&nbsp;
        <kbd>Ctrl</kbd>+<kbd>Tab</kbd> Next Tab
    </div>

    <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs/loader.js"></script>
    <script>
        let requestEditor, responseEditor, responseRawEditor, responseHeadersEditor;
        let routes = [];
        let params = [];
        let headers = [{ enabled: true, key: 'Content-Type', value: 'application/json' }];
        let lastResponseHeaders = {};
        let lastResponseRaw = '';
        let lastResponseJson = '';
        let currentEndpointInfo = null;
        const isDark = ${isDark};

        // Tab system
        let tabs = [];
        let activeTabId = null;
        const STORAGE_KEY = 'nexus_playground_tabs';

        function generateTabId() {
            return 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        }

        function saveTabsToStorage() {
            try {
                saveCurrentTabState();
                const data = {
                    tabs: tabs,
                    activeTabId: activeTabId
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            } catch (e) {
                console.warn('Failed to save tabs to localStorage:', e);
            }
        }

        function loadTabsFromStorage() {
            try {
                const data = localStorage.getItem(STORAGE_KEY);
                if (data) {
                    const parsed = JSON.parse(data);
                    if (parsed.tabs && parsed.tabs.length > 0) {
                        tabs = parsed.tabs;
                        activeTabId = parsed.activeTabId;
                        return true;
                    }
                }
            } catch (e) {
                console.warn('Failed to load tabs from localStorage:', e);
            }
            return false;
        }

        function saveCurrentTabState() {
            if (!activeTabId) return;
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab) {
                tab.state = {
                    method: document.getElementById('methodSelect').value,
                    url: document.getElementById('urlInput').value,
                    body: requestEditor ? requestEditor.getValue() : '{}',
                    params: JSON.parse(JSON.stringify(params)),
                    headers: JSON.parse(JSON.stringify(headers)),
                    response: {
                        json: lastResponseJson,
                        raw: lastResponseRaw,
                        headers: lastResponseHeaders,
                        statusText: document.getElementById('responseStatus').textContent,
                        statusClass: document.getElementById('responseStatus').className,
                        meta: document.getElementById('responseMeta').textContent,
                        hasResponse: document.getElementById('responseTabs').style.display === 'flex'
                    }
                };
            }
        }

        function loadTabState(tabId) {
            const tab = tabs.find(t => t.id === tabId);
            if (!tab) return;

            // If tab has saved state, restore it
            if (tab.state) {
                const state = tab.state;
                document.getElementById('methodSelect').value = state.method;
                updateMethodColorOnly();
                document.getElementById('urlInput').value = state.url;
                
                if (requestEditor) {
                    requestEditor.setValue(state.body);
                }
                
                params = JSON.parse(JSON.stringify(state.params));
                headers = JSON.parse(JSON.stringify(state.headers));
                renderParams();
                renderHeaders();

                // Restore response
                if (state.response && state.response.hasResponse) {
                    lastResponseJson = state.response.json;
                    lastResponseRaw = state.response.raw;
                    lastResponseHeaders = state.response.headers;

                    document.getElementById('emptyResponse').style.display = 'none';
                    document.getElementById('responseTabs').style.display = 'flex';
                    
                    if (responseEditor) responseEditor.setValue(lastResponseJson || '');
                    if (responseRawEditor) responseRawEditor.setValue(lastResponseRaw || '');
                    
                    const headersText = Object.entries(lastResponseHeaders || {})
                        .map(([k, v]) => k + ': ' + v)
                        .join('\\n');
                    if (responseHeadersEditor) responseHeadersEditor.setValue(headersText || 'No headers');
                    
                    document.getElementById('resHeadersCount').textContent = Object.keys(lastResponseHeaders || {}).length;
                    document.getElementById('responseStatus').textContent = state.response.statusText;
                    document.getElementById('responseStatus').className = state.response.statusClass;
                    document.getElementById('responseMeta').textContent = state.response.meta;
                } else {
                    resetResponse();
                }
            } else {
                // New tab without state - initialize with tab's basic info
                document.getElementById('methodSelect').value = tab.method || 'GET';
                updateMethodColorOnly();
                document.getElementById('urlInput').value = '${baseUrl}' + (tab.path || '/');
                
                if (requestEditor) {
                    requestEditor.setValue('{}');
                }
                
                params = [];
                headers = [{ enabled: true, key: 'Content-Type', value: 'application/json' }];
                renderParams();
                renderHeaders();
                resetResponse();
            }

            // Update info panel based on current tab
            updateInfoPanelForTab(tab);
        }

        function updateInfoPanelForTab(tab) {
            // Find the matching endpoint from routes
            const endpoint = routes.find(r => r.path === tab.path && r.method === tab.method);
            currentEndpointInfo = endpoint || null;
            renderInfoPanel();
        }

        function resetResponse() {
            document.getElementById('emptyResponse').style.display = 'flex';
            document.getElementById('responseTabs').style.display = 'none';
            if (responseEditor) responseEditor.setValue('');
            if (responseRawEditor) responseRawEditor.setValue('');
            if (responseHeadersEditor) responseHeadersEditor.setValue('');
            document.getElementById('responseStatus').textContent = '';
            document.getElementById('responseStatus').className = 'response-status';
            document.getElementById('responseMeta').textContent = '';
            lastResponseJson = '';
            lastResponseRaw = '';
            lastResponseHeaders = {};
        }

        function createNewTab(endpoint) {
            const tabId = generateTabId();
            const tab = {
                id: tabId,
                method: endpoint ? endpoint.method : 'GET',
                path: endpoint ? endpoint.path : '/',
                label: endpoint ? endpoint.path : 'New Request',
                state: null
            };
            tabs.push(tab);
            return tabId;
        }

        function switchToTab(tabId) {
            if (activeTabId === tabId) return;
            
            saveCurrentTabState();
            activeTabId = tabId;
            loadTabState(tabId);
            renderTabs();
            saveTabsToStorage();
            
            // Highlight active endpoint in sidebar
            const tab = tabs.find(t => t.id === tabId);
            if (tab) {
                document.querySelectorAll('.endpoint-item').forEach(el => {
                    if (el.dataset.path === tab.path && el.dataset.method === tab.method) {
                        el.classList.add('active');
                    } else {
                        el.classList.remove('active');
                    }
                });
            }
        }

        function closeTab(tabId, event) {
            if (event) {
                event.stopPropagation();
            }
            
            const tabIndex = tabs.findIndex(t => t.id === tabId);
            if (tabIndex === -1) return;
            
            tabs.splice(tabIndex, 1);
            
            if (tabs.length === 0) {
                // Create a new empty tab
                const newTabId = createNewTab(null);
                activeTabId = newTabId;
                initializeNewTabState();
            } else if (activeTabId === tabId) {
                // Switch to adjacent tab
                const newIndex = Math.min(tabIndex, tabs.length - 1);
                activeTabId = tabs[newIndex].id;
                loadTabState(activeTabId);
            }
            
            renderTabs();
            saveTabsToStorage();
        }

        function initializeNewTabState() {
            document.getElementById('methodSelect').value = 'GET';
            updateMethodColorOnly();
            document.getElementById('urlInput').value = '${baseUrl}/';
            if (requestEditor) requestEditor.setValue('{}');
            params = [];
            headers = [{ enabled: true, key: 'Content-Type', value: 'application/json' }];
            renderParams();
            renderHeaders();
            resetResponse();
            
            // Update tab info
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab) {
                tab.method = 'GET';
                tab.path = '/';
                tab.label = 'New Request';
            }
            
            // Save state immediately
            saveCurrentTabState();
        }

        function renderTabs() {
            const container = document.getElementById('apiTabs');
            if (!container) return;
            
            let html = '';
            tabs.forEach(tab => {
                const isActive = tab.id === activeTabId;
                const methodClass = tab.method.toLowerCase();
                html += '<div class="api-tab ' + (isActive ? 'active' : '') + '" onclick="switchToTab(\\'' + tab.id + '\\')">';
                html += '<span class="api-tab-method ' + methodClass + '">' + tab.method + '</span>';
                html += '<span class="api-tab-path" title="' + tab.path + '">' + tab.label + '</span>';
                html += '<button class="api-tab-close" onclick="closeTab(\\'' + tab.id + '\\', event)">×</button>';
                html += '</div>';
            });
            
            html += '<button class="api-tab-add" onclick="addNewTab()" title="New Tab">+</button>';
            if (tabs.length > 1) {
                html += '<button class="api-tab-add" onclick="clearAllTabs()" title="Clear All Tabs" style="margin-left:auto;color:var(--error-color);">🗑</button>';
            }
            container.innerHTML = html;
        }

        function addNewTab() {
            saveCurrentTabState();
            const newTabId = createNewTab(null);
            activeTabId = newTabId;
            initializeNewTabState();
            renderTabs();
            saveTabsToStorage();
        }

        function clearAllTabs() {
            if (!confirm('Clear all tabs and start fresh?')) return;
            localStorage.removeItem(STORAGE_KEY);
            tabs = [];
            const newTabId = createNewTab(null);
            activeTabId = newTabId;
            initializeNewTabState();
            renderTabs();
        }

        require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });

        require(['vs/editor/editor.main'], function() {
            monaco.editor.defineTheme('nexus-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [],
                colors: { 'editor.background': '#0d1117' }
            });

            monaco.editor.defineTheme('nexus-light', {
                base: 'vs',
                inherit: true,
                rules: [],
                colors: { 'editor.background': '#ffffff' }
            });

            const theme = isDark ? 'nexus-dark' : 'nexus-light';

            requestEditor = monaco.editor.create(document.getElementById('requestEditor'), {
                value: '{}',
                language: 'json',
                theme: theme,
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "'SF Mono', 'Fira Code', monospace",
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                wordWrap: 'on',
                padding: { top: 12 }
            });

            responseEditor = monaco.editor.create(document.getElementById('responseEditor'), {
                value: '',
                language: 'json',
                theme: theme,
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "'SF Mono', 'Fira Code', monospace",
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                readOnly: true,
                wordWrap: 'on',
                padding: { top: 12 }
            });

            responseRawEditor = monaco.editor.create(document.getElementById('responseRawEditor'), {
                value: '',
                language: 'plaintext',
                theme: theme,
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "'SF Mono', 'Fira Code', monospace",
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                readOnly: true,
                wordWrap: 'on',
                padding: { top: 12 }
            });

            responseHeadersEditor = monaco.editor.create(document.getElementById('responseHeadersEditor'), {
                value: '',
                language: 'plaintext',
                theme: theme,
                minimap: { enabled: false },
                fontSize: 13,
                fontFamily: "'SF Mono', 'Fira Code', monospace",
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                readOnly: true,
                wordWrap: 'on',
                padding: { top: 12 }
            });

            requestEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, sendRequest);

            // Initialize tabs - load from storage or create new
            const hasStoredTabs = loadTabsFromStorage();
            if (hasStoredTabs && tabs.length > 0) {
                renderTabs();
                loadTabState(activeTabId);
            } else {
                const firstTabId = createNewTab(null);
                activeTabId = firstTabId;
                renderTabs();
            }

            // Auto-save on page unload
            window.addEventListener('beforeunload', saveTabsToStorage);

            loadRoutes();
            renderParams();
            renderHeaders();
            initResizer();
        });

        async function loadRoutes() {
            try {
                const res = await fetch('${config.path}/api/routes');
                routes = await res.json();
                renderEndpoints();
            } catch (err) {
                console.error('Failed to load routes:', err);
            }
        }

        function renderEndpoints() {
            const container = document.getElementById('endpointsList');
            const grouped = {};

            routes.forEach(route => {
                const tag = route.tags?.[0] || 'General';
                if (!grouped[tag]) grouped[tag] = [];
                grouped[tag].push(route);
            });

            let html = '';
            for (const [tag, endpoints] of Object.entries(grouped)) {
                html += '<div class="endpoint-group" id="group-' + tag + '">';
                html += '<div class="endpoint-group-header" onclick="toggleGroup(\\'' + tag + '\\')">';
                html += '<span class="arrow">▼</span>' + tag + ' <span style="opacity:0.5">(' + endpoints.length + ')</span></div>';
                html += '<div class="endpoint-group-items">';
                
                endpoints.forEach((ep, idx) => {
                    const deprecated = ep.deprecated ? 'deprecated' : '';
                    html += '<div class="endpoint-item ' + deprecated + '" onclick="selectEndpoint(\\'' + tag + '\\',' + idx + ')" data-path="' + ep.path + '" data-method="' + ep.method + '">';
                    html += '<span class="method-badge ' + ep.method.toLowerCase() + '">' + ep.method + '</span>';
                    html += '<span class="endpoint-path" title="' + (ep.summary || ep.path) + '">' + ep.path + '</span>';
                    html += '</div>';
                });

                html += '</div></div>';
            }

            container.innerHTML = html;
        }

        function toggleGroup(tag) {
            document.getElementById('group-' + tag).classList.toggle('collapsed');
        }

        function toggleSidebar() {
            document.getElementById('sidebar').classList.toggle('collapsed');
            setTimeout(() => {
                requestEditor?.layout();
                responseEditor?.layout();
            }, 310);
        }

        function selectEndpoint(tag, idx) {
            const grouped = {};
            routes.forEach(route => {
                const t = route.tags?.[0] || 'General';
                if (!grouped[t]) grouped[t] = [];
                grouped[t].push(route);
            });

            const endpoint = grouped[tag][idx];
            
            // Store current endpoint info for the Info tab
            currentEndpointInfo = endpoint;
            renderInfoPanel();
            
            // Check if tab already exists for this endpoint
            const existingTab = tabs.find(t => t.path === endpoint.path && t.method === endpoint.method);
            
            if (existingTab) {
                // Switch to existing tab
                switchToTab(existingTab.id);
            } else {
                // Save current tab state and create new tab
                saveCurrentTabState();
                const newTabId = createNewTab(endpoint);
                activeTabId = newTabId;
                
                // Set up new tab content
                document.getElementById('methodSelect').value = endpoint.method;
                updateMethodColorOnly();

                let url = '${baseUrl}' + endpoint.path;
                document.getElementById('urlInput').value = url;

                if (endpoint.schema?.body) {
                    requestEditor.setValue(JSON.stringify(endpoint.schema.body, null, 2));
                } else {
                    requestEditor.setValue('{}');
                }

                params = [];
                if (endpoint.schema?.query) {
                    endpoint.schema.query.forEach(q => {
                        params.push({ enabled: !q.optional, key: q.name, value: '' });
                    });
                }
                headers = [{ enabled: true, key: 'Content-Type', value: 'application/json' }];
                renderParams();
                renderHeaders();
                resetResponse();
                
                // Immediately save the new tab state
                saveCurrentTabState();
                
                renderTabs();
                saveTabsToStorage();
            }
            
            // Highlight in sidebar
            document.querySelectorAll('.endpoint-item').forEach(el => {
                if (el.dataset.path === endpoint.path && el.dataset.method === endpoint.method) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            });
        }

        function updateMethodColorOnly() {
            const select = document.getElementById('methodSelect');
            const method = select.value.toLowerCase();
            const colors = { get: '#3fb950', post: '#2f81f7', put: '#d29922', patch: '#a371f7', delete: '#f85149' };
            select.style.background = colors[method];
            select.style.color = ['get', 'put'].includes(method) ? '#000' : '#fff';
        }

        function updateMethodColor() {
            updateMethodColorOnly();
            updateCurrentTabLabel();
        }

        function updateCurrentTabLabel() {
            if (!activeTabId) return;
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab) {
                const url = document.getElementById('urlInput').value;
                const method = document.getElementById('methodSelect').value;
                // Extract path from URL
                try {
                    const urlObj = new URL(url);
                    tab.path = urlObj.pathname;
                } catch (e) {
                    tab.path = url.replace(/^https?:\\/\\/[^\\/]+/, '') || '/';
                }
                tab.method = method;
                tab.label = tab.path;
                renderTabs();
            }
        }

        function renderInfoPanel() {
            const panel = document.getElementById('infoPanel');
            if (!currentEndpointInfo) {
                panel.innerHTML = '<div class="info-empty">Select an endpoint to view its information</div>';
                return;
            }

            const ep = currentEndpointInfo;
            let html = '';

            // Method and Path header
            html += '<div class="info-method-path">';
            html += '<span class="method-badge ' + ep.method.toLowerCase() + '">' + ep.method + '</span>';
            html += '<span class="path">' + ep.path + '</span>';
            html += '</div>';

            // Deprecated warning
            if (ep.deprecated) {
                html += '<div class="info-section">';
                html += '<div class="info-deprecated">⚠️ This endpoint is deprecated</div>';
                html += '</div>';
            }

            // Summary
            if (ep.summary) {
                html += '<div class="info-section">';
                html += '<div class="info-label">Summary</div>';
                html += '<div class="info-value">' + escapeHtml(ep.summary) + '</div>';
                html += '</div>';
            }

            // Description
            if (ep.description) {
                html += '<div class="info-section">';
                html += '<div class="info-label">Description</div>';
                html += '<div class="info-value">' + escapeHtml(ep.description) + '</div>';
                html += '</div>';
            }

            // Tags
            if (ep.tags && ep.tags.length > 0) {
                html += '<div class="info-section">';
                html += '<div class="info-label">Tags</div>';
                html += '<div class="info-tags">';
                ep.tags.forEach(tag => {
                    html += '<span class="info-tag">' + escapeHtml(tag) + '</span>';
                });
                html += '</div>';
                html += '</div>';
            }

            // Responses
            if (ep.responses && Object.keys(ep.responses).length > 0) {
                html += '<div class="info-section">';
                html += '<div class="info-label">Responses</div>';
                html += '<div class="info-responses">';
                Object.entries(ep.responses).forEach(([code, desc]) => {
                    const codeNum = parseInt(code);
                    let codeClass = 'success';
                    if (codeNum >= 300 && codeNum < 400) codeClass = 'redirect';
                    else if (codeNum >= 400 && codeNum < 500) codeClass = 'client-error';
                    else if (codeNum >= 500) codeClass = 'server-error';
                    
                    html += '<div class="info-response-item">';
                    html += '<span class="info-response-code ' + codeClass + '">' + code + '</span>';
                    html += '<span class="info-response-desc">' + escapeHtml(desc) + '</span>';
                    html += '</div>';
                });
                html += '</div>';
                html += '</div>';
            }

            // Example
            if (ep.example) {
                html += '<div class="info-section">';
                html += '<div class="info-label-row">';
                html += '<div class="info-label">Example Body</div>';
                html += '<button class="info-use-btn" onclick="useExampleAsBody()">📋 Use as Body</button>';
                html += '</div>';
                html += '<pre class="info-example-code">' + escapeHtml(ep.example) + '</pre>';
                html += '</div>';
            }

            // Schema info
            if (ep.schema) {
                if (ep.schema.params && ep.schema.params.length > 0) {
                    html += '<div class="info-section">';
                    html += '<div class="info-label">Path Parameters</div>';
                    html += '<div class="info-responses">';
                    ep.schema.params.forEach(p => {
                        html += '<div class="info-response-item">';
                        html += '<span class="info-response-code success">' + escapeHtml(p.name) + '</span>';
                        html += '<span class="info-response-desc">' + escapeHtml(p.type || 'string') + (p.optional ? ' (optional)' : ' (required)') + '</span>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '</div>';
                }

                if (ep.schema.query && ep.schema.query.length > 0) {
                    html += '<div class="info-section">';
                    html += '<div class="info-label">Query Parameters</div>';
                    html += '<div class="info-responses">';
                    ep.schema.query.forEach(q => {
                        html += '<div class="info-response-item">';
                        html += '<span class="info-response-code redirect">' + escapeHtml(q.name) + '</span>';
                        html += '<span class="info-response-desc">' + escapeHtml(q.type || 'string') + (q.optional ? ' (optional)' : ' (required)') + '</span>';
                        html += '</div>';
                    });
                    html += '</div>';
                    html += '</div>';
                }
            }

            if (html === '') {
                html = '<div class="info-empty">No additional information available for this endpoint</div>';
            }

            panel.innerHTML = html;
        }

        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function useExampleAsBody() {
            if (!currentEndpointInfo || !currentEndpointInfo.example) return;
            
            // Get the example and try to format it as pretty JSON
            let example = currentEndpointInfo.example;
            try {
                // Parse and re-stringify for proper formatting
                const parsed = JSON.parse(example);
                example = JSON.stringify(parsed, null, 2);
            } catch (e) {
                // If not valid JSON, use as-is
            }
            
            // Set the example to the request body editor
            if (requestEditor) {
                requestEditor.setValue(example);
            }
            
            // Switch to Body tab
            switchTab('body');
            
            // Visual feedback on button
            const btn = document.querySelector('.info-use-btn');
            if (btn) {
                const originalText = btn.innerHTML;
                btn.innerHTML = '\u2713 Copied to Body';
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.classList.remove('copied');
                }, 1500);
            }
            
            // Save tab state
            saveCurrentTabState();
        }

        function switchTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.editor-wrapper').forEach(w => w.classList.remove('active'));
            document.querySelector('.tab[data-tab="' + tab + '"]').classList.add('active');
            document.getElementById(tab + 'Tab').classList.add('active');
            requestEditor?.layout();
        }

        function switchResponseTab(tab) {
            document.querySelectorAll('.response-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.response-content').forEach(c => c.classList.remove('active'));
            document.querySelector('.response-tab[data-restab="' + tab + '"]').classList.add('active');
            document.getElementById(tab + 'Content').classList.add('active');
            
            // Force layout update for the active editor
            setTimeout(() => {
                if (tab === 'json') responseEditor?.layout();
                else if (tab === 'raw') responseRawEditor?.layout();
                else if (tab === 'headers') responseHeadersEditor?.layout();
            }, 10);
        }

        function renderParams() {
            const container = document.getElementById('paramsEditor');
            let html = '';
            params.forEach((p, i) => {
                html += '<div class="param-row">';
                html += '<input type="checkbox" class="param-checkbox" ' + (p.enabled ? 'checked' : '') + ' onchange="params[' + i + '].enabled=this.checked;updateParamsCount()">';
                html += '<input type="text" class="param-input key" placeholder="Key" value="' + p.key + '" onchange="params[' + i + '].key=this.value">';
                html += '<input type="text" class="param-input" placeholder="Value" value="' + p.value + '" onchange="params[' + i + '].value=this.value">';
                html += '<button class="param-delete" onclick="params.splice(' + i + ',1);renderParams()">✕</button>';
                html += '</div>';
            });
            html += '<button class="add-param-btn" onclick="params.push({enabled:true,key:\\'\\',value:\\'\\'});renderParams()">+ Add</button>';
            container.innerHTML = html;
            updateParamsCount();
        }

        function updateParamsCount() {
            document.getElementById('paramsCount').textContent = params.filter(p => p.enabled && p.key).length;
        }

        function renderHeaders() {
            const container = document.getElementById('headersEditor');
            let html = '';
            headers.forEach((h, i) => {
                html += '<div class="param-row">';
                html += '<input type="checkbox" class="param-checkbox" ' + (h.enabled ? 'checked' : '') + ' onchange="headers[' + i + '].enabled=this.checked;updateHeadersCount()">';
                html += '<input type="text" class="param-input key" placeholder="Key" value="' + h.key + '" onchange="headers[' + i + '].key=this.value">';
                html += '<input type="text" class="param-input" placeholder="Value" value="' + h.value + '" onchange="headers[' + i + '].value=this.value">';
                html += '<button class="param-delete" onclick="headers.splice(' + i + ',1);renderHeaders()">✕</button>';
                html += '</div>';
            });
            html += '<button class="add-param-btn" onclick="headers.push({enabled:true,key:\\'\\',value:\\'\\'});renderHeaders()">+ Add</button>';
            container.innerHTML = html;
            updateHeadersCount();
        }

        function updateHeadersCount() {
            document.getElementById('headersCount').textContent = headers.filter(h => h.enabled && h.key).length;
        }

        async function sendRequest() {
            const method = document.getElementById('methodSelect').value;
            let url = document.getElementById('urlInput').value;

            const queryParams = params.filter(p => p.enabled && p.key);
            if (queryParams.length > 0) {
                const sp = new URLSearchParams();
                queryParams.forEach(p => sp.append(p.key, p.value));
                url += (url.includes('?') ? '&' : '?') + sp.toString();
            }

            const reqHeaders = {};
            headers.filter(h => h.enabled && h.key).forEach(h => reqHeaders[h.key] = h.value);

            let body = undefined;
            if (['POST', 'PUT', 'PATCH'].includes(method)) {
                const bodyContent = requestEditor.getValue().trim();
                if (bodyContent && bodyContent !== '{}') {
                    body = bodyContent;
                }
            }

            const sendBtn = document.getElementById('sendBtn');
            const sendBtnText = document.getElementById('sendBtnText');
            const spinner = document.getElementById('spinner');
            const emptyState = document.getElementById('emptyResponse');
            const responseTabs = document.getElementById('responseTabs');
            
            sendBtn.disabled = true;
            sendBtnText.textContent = 'Sending...';
            spinner.style.display = 'block';

            const startTime = performance.now();

            try {
                const fetchOptions = { method, headers: reqHeaders };
                if (body) fetchOptions.body = body;

                console.log('Sending request:', { url, method, headers: reqHeaders, body });

                const res = await fetch(url, fetchOptions);
                const endTime = performance.now();
                const duration = Math.round(endTime - startTime);

                // Store raw response
                lastResponseRaw = await res.text();
                let responseSize = new Blob([lastResponseRaw]).size;

                console.log('Response received:', { status: res.status, text: lastResponseRaw });

                // Store response headers
                lastResponseHeaders = {};
                res.headers.forEach((value, key) => {
                    lastResponseHeaders[key] = value;
                });
                
                // Format headers for display
                const headersText = Object.entries(lastResponseHeaders)
                    .map(([k, v]) => k + ': ' + v)
                    .join('\\n');
                
                // Update headers count badge
                document.getElementById('resHeadersCount').textContent = Object.keys(lastResponseHeaders).length;

                // Try parse JSON for pretty display
                lastResponseJson = lastResponseRaw;
                try {
                    const json = JSON.parse(lastResponseRaw);
                    lastResponseJson = JSON.stringify(json, null, 2);
                } catch (e) {
                    // Not JSON, keep as is
                }

                // Show response tabs and content
                emptyState.style.display = 'none';
                responseTabs.style.display = 'flex';
                
                // Set all editors content
                responseEditor.setValue(lastResponseJson);
                responseRawEditor.setValue(lastResponseRaw);
                responseHeadersEditor.setValue(headersText || 'No headers received');
                
                // Force layout
                setTimeout(() => {
                    responseEditor.layout();
                    responseRawEditor.layout();
                    responseHeadersEditor.layout();
                }, 50);

                const statusEl = document.getElementById('responseStatus');
                statusEl.textContent = res.status + ' ' + res.statusText;
                statusEl.className = 'response-status ' + (res.ok ? 'success' : 'error');

                document.getElementById('responseMeta').textContent = duration + 'ms • ' + formatBytes(responseSize);

            } catch (err) {
                console.error('Request failed:', err);
                
                const errorResponse = {
                    error: err.message,
                    hint: 'Make sure the server is running and the URL is correct'
                };
                
                lastResponseJson = JSON.stringify(errorResponse, null, 2);
                lastResponseRaw = err.message;
                lastResponseHeaders = {};
                
                // Show response tabs and content
                emptyState.style.display = 'none';
                responseTabs.style.display = 'flex';
                
                responseEditor.setValue(lastResponseJson);
                responseRawEditor.setValue(lastResponseRaw);
                responseHeadersEditor.setValue('No headers (request failed)');
                document.getElementById('resHeadersCount').textContent = '0';
                
                setTimeout(() => {
                    responseEditor.layout();
                    responseRawEditor.layout();
                    responseHeadersEditor.layout();
                }, 50);

                const statusEl = document.getElementById('responseStatus');
                statusEl.textContent = 'Error';
                statusEl.className = 'response-status error';
                document.getElementById('responseMeta').textContent = '';
            } finally {
                sendBtn.disabled = false;
                sendBtnText.textContent = 'Send';
                spinner.style.display = 'none';
                saveTabsToStorage();
            }
        }

        function formatBytes(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        }

        function filterEndpoints() {
            const query = document.getElementById('searchInput').value.toLowerCase();
            document.querySelectorAll('.endpoint-item').forEach(el => {
                const match = el.dataset.path.toLowerCase().includes(query) || el.dataset.method.toLowerCase().includes(query);
                el.style.display = match ? 'flex' : 'none';
            });
        }

        function initResizer() {
            const resizer = document.getElementById('resizer');
            const requestSection = document.getElementById('requestSection');
            const main = document.querySelector('.main');
            let isResizing = false;
            let startY = 0;
            let startHeight = 0;

            resizer.addEventListener('mousedown', (e) => {
                isResizing = true;
                startY = e.clientY;
                startHeight = requestSection.offsetHeight;
                document.body.style.cursor = 'row-resize';
                document.body.style.userSelect = 'none';
            });

            document.addEventListener('mousemove', (e) => {
                if (!isResizing) return;
                
                const deltaY = e.clientY - startY;
                const newHeight = startHeight + deltaY;
                const mainHeight = main.offsetHeight;
                const minHeight = 150;
                const maxHeight = mainHeight - 150;

                if (newHeight >= minHeight && newHeight <= maxHeight) {
                    requestSection.style.height = newHeight + 'px';
                    requestEditor?.layout();
                    responseEditor?.layout();
                }
            });

            document.addEventListener('mouseup', () => {
                if (isResizing) {
                    isResizing = false;
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                    requestEditor?.layout();
                    responseEditor?.layout();
                }
            });
        }

        document.addEventListener('keydown', (e) => {
            // Ctrl+Enter - Send request
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                sendRequest();
            }
            // Ctrl+W - Close current tab
            if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
                e.preventDefault();
                if (activeTabId) {
                    closeTab(activeTabId, null);
                }
            }
            // Ctrl+Tab - Next tab
            if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                if (tabs.length > 1) {
                    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
                    const nextIndex = (currentIndex + 1) % tabs.length;
                    switchToTab(tabs[nextIndex].id);
                }
            }
            // Ctrl+Shift+Tab - Previous tab
            if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && e.shiftKey) {
                e.preventDefault();
                if (tabs.length > 1) {
                    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
                    const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
                    switchToTab(tabs[prevIndex].id);
                }
            }
            // Ctrl+T - New tab
            if ((e.ctrlKey || e.metaKey) && e.key === 't') {
                e.preventDefault();
                addNewTab();
            }
        });

        updateMethodColor();
    </script>
</body>
</html>`;
}
