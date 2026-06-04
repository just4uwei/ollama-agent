"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChatHtml = getChatHtml;
const vscode = __importStar(require("vscode"));
/**
 * Renders the full HTML for the Ollama Agent chat webview.
 * Extracted from chatViewProvider.ts for maintainability.
 */
function getChatHtml(webview, extensionUri) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'out', 'chatViewProvider.js'));
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ollama Agent Chat</title>
    <style>
        :root {
            --bg: var(--vscode-editor-background, #1e1e1e);
            --fg: var(--vscode-editor-foreground, #cccccc);
            --input-bg: var(--vscode-input-background, #252526);
            --border: var(--vscode-panel-border, #424242);
            --accent: var(--vscode-button-background, #0e639c);
            --accent-fg: var(--vscode-button-foreground, #ffffff);
            --secondary: var(--vscode-button-secondaryBackground, #3a3a3a);
            --secondary-fg: var(--vscode-button-secondaryForeground, #cccccc);
            --hover: var(--vscode-button-hoverBackground, #1177bb);
            --error: var(--vscode-errorForeground, #f48771);
            --warning: var(--vscode-editorWarning-foreground, #cca700);
            --info: var(--vscode-editorInfo-foreground, #3794ff);
            --success: var(--vscode-testing-iconPassed, #89d185);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
            font-size: 13px; color: var(--fg); background: var(--bg);
            display: flex; flex-direction: column; height: 100vh; overflow: hidden;
        }

        /* ── Header ── */
        .header {
            padding: 8px 12px;
            border-bottom: 1px solid var(--border);
            display: flex; gap: 8px; align-items: center;
            flex-shrink: 0;
        }
        .header .title { font-weight: 600; font-size: 13px; }
        .header .spacer { flex: 1; }
        .header button {
            padding: 4px 10px;
            background: var(--secondary);
            color: var(--secondary-fg);
            border: none; border-radius: 4px; cursor: pointer; font-size: 11px;
        }
        .header button:hover { background: var(--hover); color: #fff; }
        .restart-btn { font-size: 13px !important; padding: 4px 8px !important; }
        .new-chat { background: var(--accent) !important; color: var(--accent-fg) !important; font-weight: 500; }
        .new-chat:hover { background: var(--hover) !important; }

        /* ── Session bar ── */
        .session-bar {
            display: none; border-bottom: 1px solid var(--border);
            flex-direction: column; gap: 2px; padding: 6px 8px; max-height: 40vh; overflow-y: auto;
            flex-shrink: 0;
        }
        .session-bar.show { display: flex; }
        .session-item {
            padding: 5px 8px; border-radius: 4px; cursor: pointer;
            display: flex; align-items: center; gap: 6px; font-size: 12px;
        }
        .session-item:hover { background: rgba(128,128,128,0.12); }
        .session-item.active { background: rgba(128,128,128,0.18); }
        .session-item .delete-btn { margin-left: auto; opacity: 0; font-size: 11px; cursor: pointer; color: var(--error); }
        .session-item:hover .delete-btn { opacity: 1; }

        /* ── Messages ── */
        #messages {
            flex: 1; overflow-y: auto; padding: 12px 14px;
            display: flex; flex-direction: column; gap: 10px;
        }
        .msg-wrapper { display: flex; flex-direction: column; max-width: 88%; }
        .msg-wrapper.user { align-self: flex-end; }
        .msg-wrapper.assistant { align-self: flex-start; }
        .msg-role { font-size: 10px; opacity: 0.5; margin-bottom: 2px; padding: 0 4px; }
        .msg-wrapper.user .msg-role { text-align: right; }
        .message {
            padding: 8px 12px; border-radius: 8px; line-height: 1.5;
            white-space: pre-wrap; word-break: break-word;
        }
        .message.user { background: var(--accent); color: var(--accent-fg); border-radius: 12px 12px 4px 12px; }
        .message.assistant { background: var(--input-bg); border-radius: 4px 12px 12px 12px; }
        .message.assistant.vision { border-left: 3px solid var(--vscode-editorWarning-foreground, #dcdcaa); }
        .message.relay { opacity: 0.55; border-left: 2px dashed var(--border); font-size: 12px; }
        .model-name {
            font-size: 10px; opacity: 0.6; margin-top: 2px; padding: 0 4px;
        }
        .msg-wrapper.user .model-name { text-align: right; }

        /* ── Tool cards ── */
        .tool-card {
            border: 1px solid var(--border); border-radius: 6px; margin-top: 4px;
            background: rgba(128,128,128,0.04); overflow: hidden;
        }
        .tool-card-header {
            display: flex; align-items: center; gap: 6px; padding: 6px 10px;
            font-weight: 500; font-size: 12px;
        }
        .tool-icon { font-size: 13px; }
        .tool-detail { color: var(--vscode-descriptionForeground); opacity: 0.7; font-size: 11px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tool-status { font-size: 11px; font-weight: 400; }
        .tool-status.running { color: var(--warning); }
        .tool-status.done { color: var(--success); }
        .tool-status.error { color: var(--error); }
        .tool-step { margin-left: auto; color: var(--vscode-descriptionForeground); font-size: 11px; }
        .tool-card-body { padding: 6px 10px; font-size: 12px; white-space: pre-wrap; max-height: 200px; overflow-y: auto; }
        .tool-card.preview { opacity: 0.8; border-left: 3px solid var(--vscode-descriptionForeground); }
        .tool-preview-header { background: rgba(128,128,128,0.1); }
        .tool-preview-body { background: rgba(128,128,128,0.05); border-radius: 4px; }

        /* ── Model indicator (handoff) ── */
        .model-indicator {
            font-size: 11px; padding: 3px 8px; border-radius: 4px; margin: 4px 0;
            display: inline-flex; align-items: center; gap: 4px;
        }
        .model-indicator.vision { border-left: 3px solid var(--vscode-editorWarning-foreground, #dcdcaa); background: rgba(220,200,100,0.08); }
        .model-indicator.text { border-left: 3px solid var(--info); background: rgba(55,148,255,0.08); }

        /* ── Loading / Thinking / Progress ── */
        .loading-indicator {
            display: none; padding: 6px 14px; font-size: 11px; color: var(--vscode-descriptionForeground);
            flex-shrink: 0;
        }
        .loading-indicator.active { display: flex; align-items: center; gap: 6px; }
        .spinner {
            width: 12px; height: 12px; border: 2px solid var(--border); border-top-color: var(--accent);
            border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .thinking-indicator {
            padding: 4px 14px; font-size: 11px; color: var(--vscode-descriptionForeground);
            opacity: 0.7; flex-shrink: 0; display: none;
        }
        .thinking-indicator.active { display: block; }
        .progress-bar-wrapper {
            padding: 4px 14px; display: flex; align-items: center; gap: 8px; flex-shrink: 0;
        }
        .progress-bar-track { flex: 1; height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
        .progress-bar-fill { height: 100%; width: 0%; background: var(--accent); border-radius: 2px; transition: width 0.3s; }
        .progress-bar-text { font-size: 10px; opacity: 0.6; min-width: 32px; text-align: right; }

        /* ── Input area ── */
        .input-area {
            border-top: 1px solid var(--border); padding: 8px 12px;
            display: flex; flex-direction: column; gap: 6px; flex-shrink: 0;
        }
        .context-preview {
            display: flex; flex-wrap: wrap; gap: 4px; font-size: 11px;
        }
        .context-chip {
            background: var(--secondary); color: var(--secondary-fg);
            padding: 2px 8px; border-radius: 10px; display: inline-flex; align-items: center; gap: 4px;
        }
        .context-chip .remove { cursor: pointer; opacity: 0.6; }
        .context-chip .remove:hover { opacity: 1; }
        textarea {
            width: 100%; background: var(--input-bg); color: var(--fg);
            border: 1px solid var(--border); border-radius: 6px;
            padding: 8px 10px; font-size: 13px; resize: vertical; min-height: 36px;
            font-family: inherit; outline: none;
        }
        textarea:focus { border-color: var(--accent); }
        .input-actions { display: flex; gap: 6px; justify-content: flex-end; }
        .send {
            background: var(--accent); color: var(--accent-fg);
            border: none; border-radius: 4px; padding: 5px 16px; cursor: pointer; font-size: 12px;
        }
        .send:hover { background: var(--hover); }
        .send:disabled { opacity: 0.5; cursor: not-allowed; }
        .stop-btn {
            background: var(--error); color: #fff;
            border: none; border-radius: 4px; padding: 5px 12px; cursor: pointer; font-size: 12px;
            display: none;
        }
        .stop-btn.visible { display: inline-block; }
        .stop-btn:hover { opacity: 0.85; }

        /* ── Handoff relay card ── */
        .msg-wrapper.relay-card { max-width: 88%; }
        .handoff-badge {
            font-size: 10px; opacity: 0.5; font-style: italic; margin: 2px 0;
        }

        /* ── Scrollbar ── */
        #messages::-webkit-scrollbar { width: 6px; }
        #messages::-webkit-scrollbar-track { background: transparent; }
        #messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    </style>
</head>
<body>
    <div class="header">
        <span class="title">🤖 Ollama Agent</span>
        <span class="spacer"></span>
        <button class="restart-btn" onclick="restartOllama()" title="重启 Ollama 服务">🔄</button>
        <button class="settings-btn" onclick="configureModels()" title="配置模型">⚙</button>
        <button class="new-chat" onclick="newChat()">＋ 新对话</button>
        <button onclick="toggleSessions()">📋 历史</button>
    </div>

    <div id="sessionBar" class="session-bar"></div>

    <div id="loadingIndicator" class="loading-indicator">
        <span class="spinner"></span>
        <span id="loadingModelLabel" class="model-label"></span>
    </div>
    <div id="thinkingIndicator" class="thinking-indicator"></div>
    <div id="progressWrapper" class="progress-bar-wrapper" style="display:none">
        <div class="progress-bar-track">
            <div id="progressFill" class="progress-bar-fill"></div>
        </div>
        <div id="progressText" class="progress-bar-text">0%</div>
    </div>
    <div id="messages"></div>

    <div class="input-area">
        <div id="contextPreview" class="context-preview"></div>
        <textarea id="input" placeholder="输入消息… (Shift+Enter 换行)" rows="2"></textarea>
        <div class="input-actions">
            <button class="send" id="sendBtn" onclick="sendMessage()">发送</button>
            <button class="stop-btn" id="stopBtn" onclick="stopGeneration()">⏹ 停止</button>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let contextFiles = [];
        let contextImages = [];
        let isLoading = false;
        let currentSessionId = null;

        const inputEl = document.getElementById('input');
        const sendBtn = document.getElementById('sendBtn');
        const stopBtn = document.getElementById('stopBtn');
        const loadingEl = document.getElementById('loadingIndicator');
        const loadingModelLabel = document.getElementById('loadingModelLabel');
        const thinkingIndicator = document.getElementById('thinkingIndicator');
        const progressWrapper = document.getElementById('progressWrapper');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const messagesEl = document.getElementById('messages');
        const sessionBar = document.getElementById('sessionBar');

        // ── Input handling ──
        inputEl.addEventListener('paste', (e) => {
            const items = e.clipboardData && e.clipboardData.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    e.preventDefault();
                    const blob = items[i].getAsFile();
                    const reader = new FileReader();
                    reader.onload = () => {
                        contextImages.push(reader.result.split(',')[1]);
                        renderContextPreview();
                    };
                    reader.readAsDataURL(blob);
                }
            }
        });

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });

        function setLoading(loading, model) {
            isLoading = loading;
            inputEl.disabled = loading;
            loadingEl.classList.toggle('active', loading);
            sendBtn.style.display = loading ? 'none' : 'block';
            stopBtn.classList.toggle('visible', loading);
            if (model) { loadingModelLabel.textContent = model + ' 生成中...'; }
            if (!loading) { loadingModelLabel.textContent = ''; }
        }

        function renderContextPreview() {
            const el = document.getElementById('contextPreview');
            el.innerHTML = '';
            contextFiles.forEach((f, i) => {
                const chip = document.createElement('span');
                chip.className = 'context-chip';
                chip.innerHTML = '📄 ' + escapeHtml(f.name) + ' <span class="remove" onclick="removeContextFile(' + i + ')">✕</span>';
                el.appendChild(chip);
            });
            contextImages.forEach((_, i) => {
                const chip = document.createElement('span');
                chip.className = 'context-chip';
                chip.innerHTML = '🖼 图片' + (i + 1) + ' <span class="remove" onclick="removeContextImage(' + i + ')">✕</span>';
                el.appendChild(chip);
            });
        }

        function removeContextFile(idx) { contextFiles.splice(idx, 1); renderContextPreview(); }
        function removeContextImage(idx) { contextImages.splice(idx, 1); renderContextPreview(); }

        // ── Send / Stop / NewChat ──
        function sendMessage() {
            const msg = inputEl.value.trim();
            if (!msg && contextFiles.length === 0 && contextImages.length === 0) return;
            if (isLoading) return;
            vscode.postMessage({
                type: 'sendMessage',
                message: msg,
                files: contextFiles.map(f => f.path),
                images: contextImages.length > 0 ? contextImages : undefined
            });
            inputEl.value = '';
            contextFiles = [];
            contextImages = [];
            renderContextPreview();
        }

        function stopGeneration() { vscode.postMessage({ type: 'stop' }); }

        function newChat() { vscode.postMessage({ type: 'newChat' }); }

        function toggleSessions() {
            sessionBar.classList.toggle('show');
            if (sessionBar.classList.contains('show')) {
                vscode.postMessage({ type: 'requestSessionList' });
            }
        }

        function configureModels() { vscode.postMessage({ type: 'configureModels' }); }

        function restartOllama() {
            if (!confirm('确认重启 Ollama 服务？这会释放显存并重新加载模型。')) return;
            vscode.postMessage({ type: 'restartOllama' });
            setLoading(true, 'Ollama 重启中');
        }

        // ── Session list rendering ──
        window.addEventListener('message', (event) => {
            const msg = event.data;
            switch (msg.type) {
                case 'sessionList':
                    renderSessionList(msg.sessions);
                    break;
                case 'sessionLoaded':
                    loadSession(msg.session);
                    break;
                case 'sessionReset':
                    currentSessionId = msg.sessionId;
                    messagesEl.innerHTML = '';
                    break;
                case 'sessionTitleUpdate':
                    updateSessionTitle(msg.sessionId, msg.title);
                    break;
                case 'addMessage':
                    appendMessage(msg.message, msg.modelTag, msg.isVision, msg.isRelay);
                    break;
                case 'updateLastAssistant':
                    updateLastAssistant(msg.content);
                    break;
                case 'removeLastAssistant':
                    removeLastAssistant();
                    break;
                case 'removeLastAssistantIfEmpty':
                    removeLastAssistantIfEmpty();
                    break;
                case 'addModelIndicator':
                    appendModelIndicator(msg.fromModel, msg.toModel, msg.indicator);
                    break;
                case 'setLoading':
                    setLoading(msg.loading, msg.model);
                    break;
                case 'addError':
                    appendError(msg.error);
                    break;
                case 'thinkingStatus':
                    thinkingIndicator.classList.toggle('active', msg.status === 'started');
                    thinkingIndicator.textContent = msg.status === 'started' ? '💭 思考中...' : '';
                    break;
                case 'progress':
                    progressWrapper.style.display = 'flex';
                    progressFill.style.width = msg.percent + '%';
                    progressText.textContent = Math.round(msg.percent) + '%';
                    break;
                case 'ollamaRestarted':
                    setLoading(false);
                    appendMessage({ role: 'system', content: '✅ Ollama 已重启，' + msg.models.length + ' 个模型可用。' });
                    break;
                case 'ollamaRestartFailed':
                    setLoading(false);
                    appendError('⚠️ Ollama 重启失败，请手动运行 ollama serve');
                    break;
                case 'configChanged':
                    // just acknowledge
                    break;
                case 'refillInput':
                    inputEl.value = msg.message || '';
                    contextFiles = (msg.files || []).map(f => ({ name: f.split(/[\\/]/).pop(), path: f }));
                    contextImages = msg.images || [];
                    renderContextPreview();
                    break;
                case 'fileContent':
                    // handle file content display if needed
                    break;
            }
        });

        // ── DOM helpers ──
        function escapeHtml(s) {
            const d = document.createElement('div');
            d.textContent = s;
            return d.innerHTML;
        }

        function appendMessage(msg, modelTag, isVision, isRelay) {
            const wrapper = document.createElement('div');
            wrapper.className = 'msg-wrapper ' + msg.role + (isRelay ? ' relay-card' : '');

            const roleLabel = document.createElement('div');
            roleLabel.className = 'msg-role';
            roleLabel.textContent = msg.role === 'user' ? '你' : (isVision ? '👁 视觉模型' : '🤖 助手');
            wrapper.appendChild(roleLabel);

            const bubble = document.createElement('div');
            bubble.className = 'message ' + msg.role + (isVision ? ' vision' : '') + (isRelay ? ' relay' : '');
            bubble.textContent = msg.content || '';
            wrapper.appendChild(bubble);

            if (modelTag) {
                const tag = document.createElement('div');
                tag.className = 'model-name';
                tag.textContent = modelTag;
                wrapper.appendChild(tag);
            }

            messagesEl.appendChild(wrapper);
            messagesEl.scrollTop = messagesEl.scrollHeight;
            return wrapper;
        }

        function updateLastAssistant(content) {
            const wrappers = messagesEl.querySelectorAll('.msg-wrapper.assistant');
            if (wrappers.length === 0) return;
            const last = wrappers[wrappers.length - 1];
            const bubble = last.querySelector('.message');
            if (bubble) bubble.textContent = content;
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        function removeLastAssistant() {
            const wrappers = messagesEl.querySelectorAll('.msg-wrapper.assistant');
            if (wrappers.length > 0) wrappers[wrappers.length - 1].remove();
        }

        function removeLastAssistantIfEmpty() {
            const wrappers = messagesEl.querySelectorAll('.msg-wrapper.assistant');
            if (wrappers.length === 0) return;
            const last = wrappers[wrappers.length - 1];
            const bubble = last.querySelector('.message');
            if (bubble && !bubble.textContent.trim()) last.remove();
        }

        function appendModelIndicator(from, to, indicator) {
            const el = document.createElement('div');
            el.className = 'model-indicator ' + indicator;
            el.textContent = '🔄 ' + from + ' → ' + to;
            messagesEl.appendChild(el);
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        function appendError(err) {
            const el = document.createElement('div');
            el.className = 'message assistant';
            el.style.color = 'var(--error)';
            el.textContent = '❌ ' + err;
            const wrapper = document.createElement('div');
            wrapper.className = 'msg-wrapper assistant';
            wrapper.appendChild(el);
            messagesEl.appendChild(wrapper);
            messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        function renderSessionList(sessions) {
            sessionBar.innerHTML = '';
            sessions.forEach(s => {
                const item = document.createElement('div');
                item.className = 'session-item' + (s.id === currentSessionId ? ' active' : '');
                item.innerHTML = '<span>' + escapeHtml(s.title) + '</span>' +
                    '<span class="delete-btn" onclick="deleteSession(\'' + s.id + '\')">✕</span>';
                item.addEventListener('click', (e) => {
                    if (e.target.classList.contains('delete-btn')) return;
                    vscode.postMessage({ type: 'switchSession', sessionId: s.id });
                    currentSessionId = s.id;
                    renderSessionList(sessions);
                });
                sessionBar.appendChild(item);
            });
        }

        function updateSessionTitle(id, title) {
            const items = sessionBar.querySelectorAll('.session-item');
            items.forEach(item => {
                if (item.dataset.id === id) {
                    item.querySelector('span').textContent = title;
                }
            });
        }

        function deleteSession(id) {
            if (!confirm('删除此对话？')) return;
            vscode.postMessage({ type: 'deleteSession', sessionId: id });
        }

        function loadSession(session) {
            currentSessionId = session.id;
            messagesEl.innerHTML = '';
            (session.messages || []).forEach(msg => {
                appendMessage(msg, msg.model, false, false);
            });
        }

        // ── Init ──
        vscode.postMessage({ type: 'requestSessionList' });
    </script>
</body>
</html>`;
}
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=chatUIRenderer.js.map