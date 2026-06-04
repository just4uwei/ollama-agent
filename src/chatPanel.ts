import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Right-side ChatPanel — opens as a WebviewPanel in the secondary column
 * (right side of the editor, alongside Explorer when split).
 * Uses the same ChatViewProvider HTML but rendered via WebviewPanel.
 */
export class ChatPanel {
    public static currentPanel: ChatPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    constructor(
        extensionUri: vscode.Uri,
        viewColumn: vscode.ViewColumn = vscode.ViewColumn.Beside  // Open beside the active editor (right side)
    ) {
        this._extensionUri = extensionUri;

        this._panel = vscode.window.createWebviewPanel(
            'ollamaAgent.chatPanel',
            '🤖 Ollama Agent',
            { viewColumn, preserveFocus: false },
            {
                enableScripts: true,
                localResourceRoots: [this._extensionUri],
                retainContextWhenHidden: true
            }
        );

        this._panel.webview.html = this._buildHtml();

        // Listen for messages from webview
        this._panel.webview.onDidReceiveMessage(
            (data) => this._handleMessage(data),
            null,
            this._disposables
        );

        // Cleanup on close
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        ChatPanel.currentPanel = this;
    }

    /** Send a message to the webview */
    postMessage(data: any): void {
        this._panel.webview.postMessage(data);
    }

    /** Reveal and focus this panel */
    reveal(column?: vscode.ViewColumn): void {
        this._panel.reveal(column ?? vscode.ViewColumn.Two, true);
    }

    dispose(): void {
        if (ChatPanel.currentPanel === this) {
            ChatPanel.currentPanel = undefined;
        }
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }

    private _handleMessage(data: any): void {
        // Forward to the global handler registered by extension.ts
        vscode.commands.executeCommand('ollamaAgent.chatPanelMessage', data).then(() => {}, () => {});
    }

    private _buildHtml(): string {
        // Inline the same HTML as ChatViewProvider._getHtmlForWebview
        // (shared via a static helper — see below)
        return ChatPanelHtml;
    }

    /** Open or reveal the right-side panel */
    public static openOrReveal(extensionUri: vscode.Uri): ChatPanel {
        if (ChatPanel.currentPanel) {
            ChatPanel.currentPanel.reveal(vscode.ViewColumn.Beside);
            return ChatPanel.currentPanel;
        }
        return new ChatPanel(extensionUri, vscode.ViewColumn.Beside);
    }
}

// ── Shared HTML for both WebviewView and WebviewPanel ──────────────────────────
// This is the same HTML returned by ChatViewProvider._getHtmlForWebview.
// Kept in sync manually — consider extracting to a shared template file.

export const ChatPanelHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ollama Agent</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            display: flex; flex-direction: column;
            height: 100vh; overflow: hidden;
        }
        .header {
            padding: 8px 12px; border-bottom: 1px solid var(--vscode-panel-border);
            display: flex; gap: 8px; align-items: center; flex-shrink: 0;
        }
        .header .title { font-weight: 600; font-size: 13px; }
        .header .spacer { flex: 1; }
        .header button {
            padding: 4px 10px; background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none; border-radius: 4px; cursor: pointer; font-size: 11px;
        }
        .header button:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .header button.new-chat { background: var(--vscode-button-background); color: var(--vscode-button-foreground); font-weight: 500; }
        .header button.new-chat:hover { background: var(--vscode-button-hoverBackground); }
        .settings-btn {
            width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
            background: none; border: none; cursor: pointer;
            color: var(--vscode-descriptionForeground);
            border-radius: 4px; font-size: 14px; transition: all 0.15s;
        }
        .settings-btn:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--vscode-editor-foreground); }
        #messages { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
        .msg-wrapper { display: flex; flex-direction: column; max-width: 88%; }
        .msg-wrapper.user { align-self: flex-end; align-items: flex-end; }
        .msg-wrapper.assistant { align-self: flex-start; align-items: flex-start; }
        .msg-wrapper.relay { opacity: 0.5; max-width: 80%; transition: opacity 0.3s; }
        .msg-wrapper.relay:hover { opacity: 1; }
        .msg-wrapper.relay .message { font-size: 12px; background: var(--vscode-editor-background); border: 1px dashed var(--vscode-panel-border); border-radius: 8px; padding: 8px 12px; }
        .msg-label { font-size: 10px; margin-bottom: 3px; display: flex; align-items: center; gap: 4px; }
        .msg-label .model-name { color: var(--vscode-descriptionForeground); opacity: 0.5; font-size: 9px; font-weight: 400; }
        .msg-label .model-name.vision::before { content: '👁 '; font-size: 8px; }
        .msg-label .relay-badge { font-size: 9px; color: var(--vscode-descriptionForeground); background: var(--vscode-editor-inactiveSelectionBackground); padding: 1px 5px; border-radius: 3px; opacity: 0.7; }
        .tool-card { display: flex; flex-direction: column; padding: 8px 12px; margin: 2px 0; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; font-size: 12px; max-width: 88%; align-self: flex-start; }
        .tool-card-header { display: flex; align-items: center; gap: 6px; font-weight: 500; }
        .tool-card-header .tool-icon { font-size: 13px; }
        .tool-card-header .tool-name { color: var(--vscode-editor-foreground); }
        .tool-card-header .tool-detail { color: var(--vscode-descriptionForeground); opacity: 0.7; font-size: 11px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tool-card-header .tool-status { font-size: 11px; font-weight: 400; }
        .tool-card-header .tool-status.running { color: var(--vscode-editorWarning-foreground, #cca700); }
        .tool-card-header .tool-status.done { color: var(--vscode-editorInfo-foreground, #3794ff); }
        .tool-card-header .tool-status.error { color: var(--vscode-editorError-foreground, #f48771); }
        .tool-card-header .tool-step { margin-left: auto; color: var(--vscode-descriptionForeground); font-size: 11px; }
        .tool-card-body { margin-top: 4px; padding: 8px 10px; background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.05)); border-radius: 6px; font-size: 12px; color: var(--vscode-descriptionForeground); white-space: pre-wrap; word-break: break-all; max-height: 140px; overflow-y: auto; display: none; }
        .tool-card-body.visible { display: block; }
        .tool-card-note { color: var(--vscode-descriptionForeground); opacity: 0.95; margin-bottom: 6px; }
        .tool-card-result { color: var(--vscode-editor-foreground); opacity: 0.9; white-space: pre-wrap; }
        .tool-card.tool-preview { opacity: 0.8; border-left: 3px solid var(--vscode-descriptionForeground); }
        .tool-card.tool-preview .tool-preview-header { background: rgba(128,128,128,0.1); }
        .tool-card.tool-preview .tool-preview-body { background: rgba(128,128,128,0.05); border-radius: 4px; }
        .model-indicator { display: flex; align-items: center; gap: 6px; padding: 4px 10px; margin: 2px 0; font-size: 11px; color: var(--vscode-descriptionForeground); border-left: 2px solid #c586c0; background: rgba(197, 134, 192, 0.06); }
        .model-indicator.vision { border-left-color: #dcdcaa; }
        .model-indicator.text { border-left-color: #4ec9b0; }
        .message { padding: 10px 14px; border-radius: 12px; word-wrap: break-word; white-space: pre-wrap; font-size: 13px; line-height: 1.5; }
        .message.user { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-bottom-right-radius: 4px; }
        .message.assistant { background: var(--vscode-editor-inactiveSelectionBackground); border-bottom-left-radius: 4px; }
        .message.assistant.vision { border-left: 2px solid rgba(220, 220, 170, 0.4); }
        .message.error { background: rgba(255,0,0,0.1); border: 1px solid rgba(255,0,0,0.3); color: #f48771; border-radius: 8px; align-self: center; }
        .progress-bar-wrapper { padding: 2px 12px 6px 12px; flex-shrink: 0; }
        .progress-bar-track { width: 100%; height: 3px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden; }
        .progress-bar-fill { height: 100%; width: 0%; background: #007acc; border-radius: 2px; transition: width 0.3s ease; }
        .progress-bar-text { font-size: 10px; color: var(--vscode-descriptionForeground); text-align: right; margin-top: 1px; opacity: 0.7; }
        .loading-indicator { display: none; padding: 4px 12px; font-size: 11px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); flex-shrink: 0; align-items: center; gap: 8px; }
        .loading-indicator.active { display: flex; }
        .loading-indicator .model-label { font-weight: 500; opacity: 0.8; }
        .thinking-indicator { display: none; padding: 3px 10px; font-size: 11px; color: var(--vscode-descriptionForeground); border-left: 2px solid #569cd6; background: rgba(86,156,214,0.06); margin: 2px 0; border-radius: 4px; align-items: center; gap: 6px; }
        .thinking-indicator.active { display: flex; }
        .thinking-indicator::after { content: '思考中'; color: var(--vscode-descriptionForeground); }
        .msg-wrapper.thinking { opacity: 0.6; }
        .message.thinking { background: rgba(86, 156, 214, 0.08); border-left: 2px solid #569cd6; font-size: 12px; color: var(--vscode-descriptionForeground); }
        .input-area { padding: 10px 12px; border-top: 1px solid var(--vscode-panel-border); flex-shrink: 0; }
        .context-preview { display: flex; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
        .context-chip { display: flex; align-items: center; gap: 4px; padding: 3px 8px; background: var(--vscode-input-background); border: 1px solid transparent; border-radius: 12px; font-size: 11px; max-width: 160px; }
        .context-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
        .context-chip .remove-chip { cursor: pointer; opacity: 0.6; font-size: 14px; line-height: 1; }
        .context-chip .remove-chip:hover { opacity: 1; }
        textarea { width: 100%; min-height: 48px; max-height: 200px; padding: 8px 10px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid transparent; border-radius: 6px; resize: vertical; font-family: inherit; font-size: 13px; line-height: 1.4; }
        textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
        textarea:disabled { opacity: 0.5; }
        .input-actions { display: flex; gap: 6px; margin-top: 6px; align-items: center; }
        button.send { flex: 1; padding: 6px 16px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 13px; }
        button.send:hover { background: var(--vscode-button-hoverBackground); }
        button.send:disabled { opacity: 0.5; cursor: not-allowed; }
        button.stop-btn { flex: 1; padding: 6px 16px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid transparent; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 13px; display: none; }
        button.stop-btn:hover { background: rgba(255,80,80,0.15); border-color: rgba(255,80,80,0.4); color: #f48771; }
        button.stop-btn.visible { display: block; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid var(--vscode-descriptionForeground); border-right-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; }
    </style>
</head>
<body>
    <div class="header">
        <span class="title">🤖 Ollama Agent</span>
        <span class="spacer"></span>
        <button class="settings-btn" onclick="configureModels()" title="配置模型">⚙</button>
        <button class="new-chat" onclick="newChat()">＋ 新对话</button>
    </div>
    <div id="loadingIndicator" class="loading-indicator"><span class="spinner"></span><span id="loadingModelLabel" class="model-label"></span></div>
    <div id="thinkingIndicator" class="thinking-indicator"></div>
    <div id="progressWrapper" class="progress-bar-wrapper" style="display:none">
        <div class="progress-bar-track"><div id="progressFill" class="progress-bar-fill"></div></div>
        <div id="progressText" class="progress-bar-text">0%</div>
    </div>
    <div id="messages"></div>
    <div class="input-area">
        <div id="contextPreview" class="context-preview"></div>
        <textarea id="input" placeholder="输入消息…" rows="2"></textarea>
        <div class="input-actions">
            <button class="send" id="sendBtn" onclick="sendMessage()">发送</button>
            <button class="stop-btn" id="stopBtn" onclick="stopGeneration()">⏹ 停止</button>
        </div>
    </div>
    <script>
        const vscode = acquireVsCodeApi();
        let contextFiles = [];
        let isLoading = false;
        let activeSessionId = '';
        const inputEl = document.getElementById('input');
        const sendBtn = document.getElementById('sendBtn');
        const stopBtn = document.getElementById('stopBtn');
        const loadingEl = document.getElementById('loadingIndicator');
        const loadingModelLabel = document.getElementById('loadingModelLabel');
        const progressWrapper = document.getElementById('progressWrapper');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const thinkingIndicator = document.getElementById('thinkingIndicator');

        inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

        function setLoading(loading, model) {
            isLoading = loading;
            inputEl.disabled = loading;
            loadingEl.classList.toggle('active', loading);
            sendBtn.style.display = loading ? 'none' : 'block';
            stopBtn.classList.toggle('visible', loading);
            if (model) { loadingModelLabel.textContent = model + ' 生成中…'; }
            if (!loading) { progressWrapper.style.display = 'none'; progressFill.style.width = '0%'; progressText.textContent = '0%'; }
        }

        function updateProgress(percent) {
            if (percent <= 0) return;
            progressWrapper.style.display = 'block';
            progressFill.style.width = Math.min(percent, 100) + '%';
            progressText.textContent = Math.round(percent) + '%';
        }

        function stopGeneration() { vscode.postMessage({ type: 'stop' }); }

        function newChat() {
            vscode.postMessage({ type: 'newChat' });
            document.getElementById('messages').innerHTML = '';
            contextFiles = [];
            renderContextPreview();
        }

        function configureModels() { vscode.postMessage({ type: 'configureModels' }); }

        function renderContextPreview() {
            const el = document.getElementById('contextPreview');
            el.innerHTML = '';
            contextFiles.forEach((f, i) => {
                const chip = document.createElement('div');
                chip.className = 'context-chip';
                chip.innerHTML = '<span>📄 ' + escHtml(f.name) + '</span><span class="remove-chip" data-idx="' + i + '" data-type="file">×</span>';
                el.appendChild(chip);
            });
            el.querySelectorAll('.remove-chip').forEach(btn => {
                btn.onclick = () => {
                    const idx = parseInt(btn.dataset.idx);
                    contextFiles.splice(idx, 1);
                    renderContextPreview();
                };
            });
        }

        function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

        /** Extract tool blocks from message text and render as preview cards */
        function extractAndDisplayToolPreviews(messageText) {
            const messages = document.getElementById('messages');
            const backtick = '\`';
            const tripleBacktick = backtick + backtick + backtick;
            const toolRegex = new RegExp(tripleBacktick + 'tool\\s*\\n([\\s\\S]*?)' + tripleBacktick, 'g');
            let match;
            let cleanText = messageText;
            
            const toolMatches = [];
            while ((match = toolRegex.exec(messageText)) !== null) {
                toolMatches.push(match[1]);
            }
            
            // Remove tool blocks from display text
            const removeToolRegex = new RegExp(tripleBacktick + 'tool\\s*\\n[\\s\\S]*?' + tripleBacktick, 'g');
            cleanText = messageText.replace(removeToolRegex, '').trim();
            
            // For each tool block, create a preview card
            for (const toolJson of toolMatches) {
                try {
                    const toolData = JSON.parse(toolJson.trim());
                    const previewId = 'tool-preview-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
                    
                    const card = document.createElement('div');
                    card.className = 'tool-card tool-preview';
                    card.id = previewId;
                    
                    const iconMap = { create_file: '📄', edit_file: '✏️', run_command: '⚡', generate_image: '🎨' };
                    const icon = iconMap[toolData.tool] || '🔧';
                    const nameMap = { create_file: '创建文件', edit_file: '编辑文件', run_command: '执行命令', generate_image: '生成图片' };
                    const name = nameMap[toolData.tool] || toolData.tool;
                    const detail = toolData.path || toolData.command || '';
                    
                    const header = document.createElement('div');
                    header.className = 'tool-card-header tool-preview-header';
                    header.innerHTML = 
                        '<span class="tool-icon">' + icon + '</span>' +
                        '<span class="tool-name">' + escHtml(name) + '</span>' +
                        '<span class="tool-detail">' + escHtml(detail) + '</span>' +
                        '<span class="tool-status preview-badge" style="margin-left: auto; color: var(--vscode-descriptionForeground); font-size: 10px; opacity: 0.7;">[预览]</span>';
                    card.appendChild(header);
                    
                    const body = document.createElement('div');
                    body.className = 'tool-card-body tool-preview-body';
                    body.style.display = 'block';
                    body.innerHTML = '<div style="font-family: monospace; font-size: 11px; color: var(--vscode-descriptionForeground); white-space: pre-wrap; word-break: break-word;">' + escHtml(JSON.stringify(toolData, null, 2)) + '</div>';
                    card.appendChild(body);
                    
                    messages.appendChild(card);
                } catch (e) {
                    // Ignore invalid JSON
                }
            }
            
            return cleanText;
        }

        function sendMessage() {
            const message = inputEl.value.trim();
            const files = contextFiles.length > 0 ? contextFiles.map(f => f.path) : undefined;
            if (!message && !files) return;
            if (isLoading) return;
            vscode.postMessage({ type: 'sendMessage', message, files });
            inputEl.value = '';
            contextFiles = [];
            renderContextPreview();
        }

        function requestModelSwitch() {
            vscode.postMessage({ type: 'switchModel', message: inputEl.value });
        }

        function appendMessage(role, content, msgModel, isVision, isRelay) {
            const messages = document.getElementById('messages');
            const wrapper = document.createElement('div');
            wrapper.className = 'msg-wrapper ' + role + (isRelay ? ' relay' : '') + (role === 'thinking' ? ' thinking' : '');
            if (role === 'assistant' || role === 'thinking') {
                if (role === 'assistant') {
                    const label = document.createElement('div');
                    label.className = 'msg-label';
                    const nameClass = isVision ? 'model-name vision' : 'model-name';
                    let labelHtml = '<span class="' + nameClass + '">' + escHtml(msgModel || '') + '</span>';
                    if (isRelay) { labelHtml += '<span class="relay-badge">接力</span>'; }
                    label.innerHTML = labelHtml;
                    wrapper.appendChild(label);
                }
            }
            const msgDiv = document.createElement('div');
            msgDiv.className = 'message ' + role + (isVision ? ' vision' : '');
            msgDiv.textContent = content;
            wrapper.appendChild(msgDiv);
            messages.appendChild(wrapper);
            messages.scrollTop = messages.scrollHeight;
        }

        function addModelIndicator(fromModel, toModel, indicator) {
            const messages = document.getElementById('messages');
            const div = document.createElement('div');
            div.className = 'model-indicator ' + indicator;
            const icon = indicator === 'vision' ? '👁' : indicator === 'text' ? '📝' : '🔄';
            div.innerHTML = icon + ' ' + escHtml(fromModel) + ' → ' + escHtml(toModel);
            messages.appendChild(div);
            messages.scrollTop = messages.scrollHeight;
        }

        function renderTodoItems(items) {
            const messages = document.getElementById('messages');
            let wrapper = document.getElementById('todo-list');
            if (!wrapper) {
                wrapper = document.createElement('div');
                wrapper.className = 'tool-card';
                wrapper.id = 'todo-list';
                const header = document.createElement('div');
                header.className = 'tool-card-header';
                header.innerHTML = '<span class="tool-icon">📝</span><span class="tool-name">待办事项</span><span class="tool-detail">任务列表</span>';
                wrapper.appendChild(header);
                const body = document.createElement('div');
                body.className = 'tool-card-body visible';
                wrapper.appendChild(body);
                messages.appendChild(wrapper);
            }
            const body = wrapper.querySelector('.tool-card-body');
            if (!body) { return; }
            body.innerHTML = items.map(item => {
                const status = item.status === 'done' ? '✅' : item.status === 'in_progress' ? '⏳' : '☐';
                return '<div id="todo-item-' + escHtml(item.id) + '">' + status + ' ' + escHtml(item.title) + '</div>';
            }).join('');
            body.classList.add('visible');
            messages.scrollTop = messages.scrollHeight;
        }

        function updateTodoItem(id, status, note) {
            const itemEl = document.getElementById('todo-item-' + id);
            if (!itemEl) { return; }
            const symbol = status === 'done' ? '✅' : status === 'in_progress' ? '⏳' : '☐';
            itemEl.textContent = symbol + ' ' + (note || itemEl.textContent.replace(/^[^\s]+\s*/, ''));
        }

        function generateToolCardId(data) {
            if (data.toolId) { return data.toolId; }
            const key = [data.tool || 'tool', data.path || '', data.command || '', data.step || '', data.totalSteps || ''].join('-');
            return 'tool-' + btoa(unescape(encodeURIComponent(key))).replace(/=+$/g, '').slice(0, 16);
        }

        function updateToolCard(data) {
            const messages = document.getElementById('messages');
            const id = generateToolCardId(data);
            let card = document.getElementById(id);
            if (!card) {
                card = document.createElement('div');
                card.className = 'tool-card';
                card.id = id;
                const iconMap = { create_file: '📄', edit_file: '✏️', run_command: '⚡', generate_image: '🎨' };
                const icon = iconMap[data.tool] || '🔧';
                const nameMap = { create_file: '创建文件', edit_file: '编辑文件', run_command: '执行命令', generate_image: '生成图片' };
                const name = nameMap[data.tool] || data.tool;
                const detail = data.path || data.command || '';

                const header = document.createElement('div');
                header.className = 'tool-card-header';
                header.innerHTML =
                    '<span class="tool-icon">' + icon + '</span>' +
                    '<span class="tool-name">' + escHtml(name) + '</span>' +
                    '<span class="tool-detail">' + escHtml(detail) + '</span>' +
                    (data.step ? '<span class="tool-step">步骤 ' + escHtml(data.step.toString()) + '/' + escHtml(data.totalSteps?.toString() || '') + '</span>' : '') +
                    '<span class="tool-status running"><span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span> 执行中</span>';
                card.appendChild(header);
                const body = document.createElement('div');
                body.className = 'tool-card-body';
                card.appendChild(body);
                messages.appendChild(card);
                messages.scrollTop = messages.scrollHeight;
            }
            const bodyEl = card.querySelector('.tool-card-body');
            if (data.note && bodyEl) {
                bodyEl.innerHTML = '<div class="tool-card-note">' + escHtml(data.note) + '</div>';
                bodyEl.classList.add('visible');
            }
            if (data.status && data.status !== 'running') {
                const statusEl = card.querySelector('.tool-status');
                if (statusEl) {
                    if (data.status === 'done') { statusEl.className = 'tool-status done'; statusEl.textContent = '✓ 完成'; }
                    else if (data.status === 'error') { statusEl.className = 'tool-status error'; statusEl.textContent = '✗ 失败'; }
                }
                if (bodyEl && data.result) {
                    const noteHtml = data.note ? '<div class="tool-card-note">' + escHtml(data.note) + '</div>' : '';
                    bodyEl.innerHTML = noteHtml + '<div class="tool-card-result">' + escHtml(data.result) + '</div>';
                    bodyEl.classList.add('visible');
                }
                messages.scrollTop = messages.scrollHeight;
            }
        }

        window.addEventListener('message', (event) => {
            const data = event.data;
            const messages = document.getElementById('messages');
            switch (data.type) {
                case 'addMessage': appendMessage(data.message.role, data.message.content, data.modelTag || data.message.model || '', data.isVision || false, data.isRelay || false); break;
                case 'addModelIndicator': addModelIndicator(data.fromModel || '', data.toModel || data.model || '', data.indicator); break;
                case 'toolStatus': updateToolCard(data); break;
                case 'progress': updateProgress(data.percent); break;
                case 'thinkingStatus': if (thinkingIndicator) thinkingIndicator.classList.toggle('active', data.status === 'started'); break;
                case 'addError': { const errDiv = document.createElement('div'); errDiv.className = 'message error'; errDiv.textContent = '❌ ' + data.error; messages.appendChild(errDiv); messages.scrollTop = messages.scrollHeight; break; }
                case 'streamChunk': {
                    let lastWrapper = messages.lastElementChild;
                    while (lastWrapper && (lastWrapper.classList.contains('model-indicator') || lastWrapper.classList.contains('tool-card') || lastWrapper.classList.contains('tool-preview'))) lastWrapper = lastWrapper.previousElementSibling;
                    if (lastWrapper && lastWrapper.classList.contains('assistant')) { const lastMsg = lastWrapper.querySelector('.message.assistant'); if (lastMsg) lastMsg.textContent += data.chunk; }
                    messages.scrollTop = messages.scrollHeight; break;
                }
                case 'updateLastAssistant': {
                    let lastWrapper = messages.lastElementChild;
                    while (lastWrapper && (lastWrapper.classList.contains('model-indicator') || lastWrapper.classList.contains('tool-card') || lastWrapper.classList.contains('tool-preview'))) lastWrapper = lastWrapper.previousElementSibling;
                    if (lastWrapper && lastWrapper.classList.contains('assistant')) { const lastMsg = lastWrapper.querySelector('.message.assistant'); if (lastMsg) { const cleanText = extractAndDisplayToolPreviews(data.content); lastMsg.textContent = cleanText; } }
                    messages.scrollTop = messages.scrollHeight; break;
                }
                case 'removeLastAssistant': {
                    let lastWrapper = messages.lastElementChild;
                    while (lastWrapper && (lastWrapper.classList.contains('model-indicator') || lastWrapper.classList.contains('tool-card') || lastWrapper.classList.contains('tool-preview'))) { messages.removeChild(lastWrapper); lastWrapper = messages.lastElementSibling; }
                    if (lastWrapper && lastWrapper.classList.contains('assistant')) messages.removeChild(lastWrapper); break;
                }
                case 'removeLastAssistantIfEmpty': {
                    let lastWrapper = messages.lastElementChild;
                    while (lastWrapper && (lastWrapper.classList.contains('model-indicator') || lastWrapper.classList.contains('tool-card') || lastWrapper.classList.contains('tool-preview'))) lastWrapper = lastWrapper.previousElementSibling;
                    if (lastWrapper && lastWrapper.classList.contains('assistant')) { const lastMsg = lastWrapper.querySelector('.message.assistant'); if (lastMsg && !lastMsg.textContent.trim()) messages.removeChild(lastWrapper); } break;
                }
                case 'setLoading': setLoading(data.loading, data.model); break;
                case 'refillInput': {
                    inputEl.value = data.message || '';
                    contextFiles = [];
                    if (data.files) { for (const fp of data.files) { const name = fp.split(/[\\\\/]/).pop(); contextFiles.push({ path: fp, name }); } }
                    renderContextPreview();
                    inputEl.focus(); break;
                }
                case 'saveInput': {
                    vscode.postMessage({ type: 'savedInputData', message: inputEl.value });
                    break;
                }
                case 'thinkingMessage': {
                    appendMessage('thinking', data.content || '', data.model || '', false, false);
                    break;
                }
                case 'todoList': {
                    if (data.todoItems && Array.isArray(data.todoItems)) { renderTodoItems(data.todoItems); }
                    break;
                }
                case 'updateTodoItem': {
                    if (data.id) { updateTodoItem(data.id, data.status, data.note); }
                    break;
                }
                case 'configChanged': break;
                case 'filesAdded': {
                    if (data.files) { for (const fp of data.files) { const name = fp.split(/[\\\\/]/).pop(); contextFiles.push({ path: fp, name }); } renderContextPreview(); } break;
                }
                case 'sessionReset': { document.getElementById('messages').innerHTML = ''; activeSessionId = data.sessionId; break; }
                case 'sessionLoaded': {
                    document.getElementById('messages').innerHTML = '';
                    if (data.session) { 
                        activeSessionId = data.session.id; 
                        if (data.session.messages) { 
                            for (const msg of data.session.messages) {
                                // Render thinking messages with weakened display
                                if (msg.role === 'thinking') {
                                    appendMessage('thinking', msg.content, msg.model || '', false, false);
                                } else {
                                    appendMessage(msg.role, msg.content, msg.model, !!(msg.images && msg.images.length > 0), false);
                                }
                                // Render tool results if available
                                if (msg.toolResults && msg.toolResults.length > 0) {
                                    for (const tr of msg.toolResults) {
                                        const resultStr = typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result);
                                        updateToolCard({ tool: tr.tool, status: tr.status || 'done', result: resultStr, step: tr.step || 1, totalSteps: tr.totalSteps || 1 });
                                    }
                                }
                                if (msg.todoItems && msg.todoItems.length > 0) {
                                    renderTodoItems(msg.todoItems);
                                }
                            } 
                            messages.scrollTop = messages.scrollHeight; 
                        } 
                    } 
                    break;
                }
            }
        });
    </script>
</body>
</html>`;
