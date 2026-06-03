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
exports.ChatViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const fileTools_1 = require("./tools/fileTools");
const terminalTools_1 = require("./tools/terminalTools");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class ChatViewProvider {
    constructor(_extensionUri, ollamaClient, codebaseIndexer, model, availableModels = [], visionModel = '') {
        this._extensionUri = _extensionUri;
        this.ollamaClient = ollamaClient;
        this.codebaseIndexer = codebaseIndexer;
        this._isProcessing = false;
        this._sessions = [];
        this._activeSessionId = '';
        /** Abort controller for the current processing run */
        this._abortController = null;
        /** Last user input for refill on stop */
        this._lastUserInput = '';
        this._lastUserFiles = [];
        this._lastUserImages = [];
        this._currentModel = model;
        this._visionModel = visionModel;
        this._availableModels = availableModels.length > 0 ? availableModels : [model];
        this.fileTools = new fileTools_1.FileTools();
        this.terminalTools = new terminalTools_1.TerminalTools();
        this._createNewSession();
    }
    getCurrentModel() { return this._currentModel; }
    switchModel(model) {
        this._currentModel = model;
        this._view?.webview.postMessage({ type: 'configChanged', textModel: model, visionModel: this._visionModel });
    }
    switchVisionModel(model) {
        this._visionModel = model;
        this._view?.webview.postMessage({ type: 'configChanged', textModel: this._currentModel, visionModel: model });
    }
    updateAvailableModels(models) { this._availableModels = models; }
    _isVisionModel(modelName) {
        return /vl|llava|vision|minicpm-v|qwen.*vl|qwen2\.5-vl|qwen3-vl/i.test(modelName.toLowerCase());
    }
    addFileFromContext(filePath) {
        if (!this._view) {
            return;
        }
        this._view.webview.postMessage({ type: 'filesAdded', files: [filePath] });
        vscode.window.setStatusBarMessage(`📄 ${path.basename(filePath)} 已添加到 Ollama Agent`, 3000);
    }
    _createNewSession() {
        const session = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            title: '新对话', messages: [], model: this._currentModel,
            createdAt: Date.now(), updatedAt: Date.now()
        };
        this._sessions.unshift(session);
        this._activeSessionId = session.id;
        return session;
    }
    _getActiveSession() {
        return this._sessions.find(s => s.id === this._activeSessionId);
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        const session = this._getActiveSession();
        if (session && session.messages.length > 0) {
            setTimeout(() => { this._view?.webview.postMessage({ type: 'sessionLoaded', session }); }, 100);
        }
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    if (this._isProcessing) {
                        this._view?.webview.postMessage({ type: 'addError', error: '正在处理中，请等待完成...' });
                        return;
                    }
                    await this.handleUserMessage(data.message, data.files, data.images);
                    break;
                case 'stop':
                    this._doStop();
                    break;
                case 'clearHistory':
                    this._clearCurrentSession();
                    break;
                case 'indexProject':
                    await this.indexProject();
                    break;
                case 'switchModel':
                    vscode.commands.executeCommand('ollamaAgent.switchModel');
                    break;
                case 'selectModel':
                    this._currentModel = data.model;
                    this._view?.webview.postMessage({ type: 'configChanged', textModel: data.model, visionModel: this._visionModel });
                    break;
                case 'configureModels':
                    vscode.commands.executeCommand('ollamaAgent.configureModels');
                    break;
                case 'newChat':
                    this._createNewSession();
                    this._view?.webview.postMessage({ type: 'sessionReset', sessionId: this._activeSessionId });
                    break;
                case 'switchSession':
                    this._activeSessionId = data.sessionId;
                    this._view?.webview.postMessage({ type: 'sessionLoaded', session: this._getActiveSession() });
                    break;
                case 'deleteSession':
                    this._sessions = this._sessions.filter(s => s.id !== data.sessionId);
                    if (this._activeSessionId === data.sessionId) {
                        if (this._sessions.length === 0) {
                            this._createNewSession();
                        }
                        else {
                            this._activeSessionId = this._sessions[0].id;
                        }
                    }
                    this._view?.webview.postMessage({ type: 'sessionList', sessions: this._sessions.map(s => ({ id: s.id, title: s.title })) });
                    break;
                case 'requestSessionList':
                    this._view?.webview.postMessage({ type: 'sessionList', sessions: this._sessions.map(s => ({ id: s.id, title: s.title })) });
                    break;
                case 'readFile': {
                    try {
                        const content = fs.readFileSync(data.path, 'utf-8');
                        this._view?.webview.postMessage({ type: 'fileContent', path: data.path, name: path.basename(data.path), content: content.slice(0, 50000) });
                    }
                    catch (e) {
                        this._view?.webview.postMessage({ type: 'addError', error: `读取文件失败: ${e.message}` });
                    }
                    break;
                }
            }
        });
    }
    _clearCurrentSession() {
        const session = this._getActiveSession();
        if (session) {
            session.messages = [];
            session.title = '新对话';
            session.updatedAt = Date.now();
        }
    }
    /** Stop the current processing and refill input */
    _doStop() {
        if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
        }
        this._isProcessing = false;
        this._view?.webview.postMessage({ type: 'setLoading', loading: false });
        this._view?.webview.postMessage({ type: 'removeLastAssistantIfEmpty' });
        // Refill the input with the last user message
        this._view?.webview.postMessage({
            type: 'refillInput',
            message: this._lastUserInput,
            files: this._lastUserFiles,
            images: this._lastUserImages
        });
    }
    _selectModel(images) {
        if (images && images.length > 0 && this._visionModel) {
            return this._visionModel;
        }
        return this._currentModel;
    }
    _parseHandoff(response) {
        const match = /```handoff\s*\n([\s\S]*?)```/g.exec(response);
        if (!match) {
            return null;
        }
        try {
            const parsed = JSON.parse(match[1].trim());
            if (parsed.target && parsed.prompt) {
                return { target: parsed.target, prompt: parsed.prompt };
            }
        }
        catch { }
        return null;
    }
    _isAborted() { return !!this._abortController?.signal.aborted; }
    async handleUserMessage(message, filePaths, images) {
        if (!this._view) {
            return;
        }
        const session = this._getActiveSession();
        if (!session) {
            return;
        }
        // Save for refill on stop
        this._lastUserInput = message;
        this._lastUserFiles = filePaths || [];
        this._lastUserImages = images || [];
        this._isProcessing = true;
        this._abortController = new AbortController();
        const hasImages = images && images.length > 0;
        const useModel = this._selectModel(images);
        const userMsg = { role: 'user', content: message, model: useModel };
        if (filePaths && filePaths.length > 0) {
            userMsg.files = filePaths;
        }
        if (hasImages) {
            userMsg.images = images;
        }
        session.messages.push(userMsg);
        if (session.title === '新对话' && message) {
            session.title = message.slice(0, 30) + (message.length > 30 ? '...' : '');
            this._view.webview.postMessage({ type: 'sessionTitleUpdate', sessionId: session.id, title: session.title });
        }
        session.updatedAt = Date.now();
        let displayContent = message;
        if (filePaths && filePaths.length > 0) {
            displayContent += '\n📎 ' + filePaths.map(p => path.basename(p)).join(', ');
        }
        this._view.webview.postMessage({ type: 'addMessage', message: { role: 'user', content: displayContent } });
        // Create primary assistant bubble
        this._view.webview.postMessage({
            type: 'addMessage',
            message: { role: 'assistant', content: '', model: useModel },
            modelTag: useModel,
            isVision: hasImages && !!this._visionModel,
            isRelay: false
        });
        this._view.webview.postMessage({ type: 'setLoading', loading: true, model: useModel });
        try {
            let response = await this.processWithAgent(message, filePaths, images, useModel);
            if (this._isAborted()) {
                return;
            }
            // ── Execute tools (card-style) ──
            await this._executeAndDisplayTools(response, useModel);
            if (this._isAborted()) {
                return;
            }
            // ── Model collaboration: handoff ──
            let handoff = this._parseHandoff(response);
            let handoffCount = 0;
            let previousModel = useModel;
            const MAX_HANDOFFS = 3;
            while (handoff && handoffCount < MAX_HANDOFFS && !this._isAborted()) {
                const targetModel = handoff.target === 'vision' ? this._visionModel : this._currentModel;
                if (!targetModel || targetModel === previousModel) {
                    break;
                }
                const isVisionTarget = handoff.target === 'vision';
                // Strip handoff block
                response = response.replace(/```handoff\s*\n[\s\S]*?```/g, '').trim();
                this._view.webview.postMessage({ type: 'updateLastAssistant', content: response });
                session.messages.push({ role: 'assistant', content: response, model: previousModel });
                // Handoff indicator
                this._view.webview.postMessage({
                    type: 'addModelIndicator',
                    fromModel: previousModel, toModel: targetModel,
                    indicator: isVisionTarget ? 'vision' : 'text'
                });
                // RELAY assistant bubble (weakened)
                this._view.webview.postMessage({
                    type: 'addMessage',
                    message: { role: 'assistant', content: '', model: targetModel },
                    modelTag: targetModel, isVision: isVisionTarget, isRelay: true
                });
                this._view.webview.postMessage({ type: 'setLoading', loading: true, model: targetModel });
                const handoffResponse = await this.processWithAgent(handoff.prompt, undefined, isVisionTarget ? images : undefined, targetModel);
                if (this._isAborted()) {
                    return;
                }
                // Execute tools from the relay response too
                await this._executeAndDisplayTools(handoffResponse, targetModel);
                session.messages.push({ role: 'assistant', content: handoffResponse, model: targetModel });
                this._view.webview.postMessage({ type: 'updateLastAssistant', content: handoffResponse });
                response = handoffResponse;
                previousModel = targetModel;
                handoff = this._parseHandoff(response);
                handoffCount++;
            }
            // Final update (no handoff)
            if (handoffCount === 0) {
                // response already updated by _executeAndDisplayTools which strips tool blocks
                const cleanResponse = this._stripToolBlocks(response);
                this._view.webview.postMessage({ type: 'updateLastAssistant', content: cleanResponse });
                session.messages.push({ role: 'assistant', content: cleanResponse, model: useModel });
            }
        }
        catch (error) {
            if (error.name === 'AbortError') {
                return;
            }
            this._view.webview.postMessage({ type: 'addError', error: error.message || String(error) });
            this._view.webview.postMessage({ type: 'removeLastAssistant' });
        }
        finally {
            this._isProcessing = false;
            this._abortController = null;
            this._view?.webview.postMessage({ type: 'setLoading', loading: false });
        }
    }
    /** Strip ```tool...``` blocks from a response string */
    _stripToolBlocks(response) {
        return response.replace(/```tool\s*\n[\s\S]*?```/g, '').trim();
    }
    /**
     * Parse and execute tool calls from a model response,
     * sending each result as a tool-card message to the webview.
     * Returns the response with tool blocks stripped.
     */
    async _executeAndDisplayTools(response, model) {
        const toolCalls = this._parseToolCalls(response);
        if (toolCalls.length === 0) {
            return;
        }
        for (const tc of toolCalls) {
            if (this._isAborted()) {
                return;
            }
            const toolId = 'tool-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
            // Send "running" card
            this._view?.webview.postMessage({
                type: 'toolStatus',
                toolId,
                tool: tc.tool,
                path: tc.path,
                command: tc.command,
                status: 'running',
                model
            });
            try {
                let resultText = '';
                switch (tc.tool) {
                    case 'create_file':
                        await this.fileTools.createFile(tc.path, tc.content);
                        resultText = `✅ 已创建: ${tc.path}`;
                        break;
                    case 'edit_file':
                        await this.fileTools.editFile(tc.path, tc.content);
                        resultText = `✅ 已编辑: ${tc.path}`;
                        break;
                    case 'run_command':
                        const output = await this.terminalTools.executeCommand(tc.command);
                        resultText = `✅ 已执行: ${tc.command}\n${output}`;
                        break;
                    default:
                        resultText = `⚠️ 未知工具: ${tc.tool}`;
                }
                this._view?.webview.postMessage({
                    type: 'toolStatus', toolId, tool: tc.tool,
                    path: tc.path, command: tc.command,
                    status: 'done', result: resultText, model
                });
            }
            catch (e) {
                this._view?.webview.postMessage({
                    type: 'toolStatus', toolId, tool: tc.tool,
                    path: tc.path, command: tc.command,
                    status: 'error', result: `❌ 失败: ${e.message}`, model
                });
            }
        }
    }
    _parseToolCalls(response) {
        const results = [];
        const regex = /```tool\s*\n([\s\S]*?)```/g;
        let match;
        while ((match = regex.exec(response)) !== null) {
            try {
                const parsed = JSON.parse(match[1].trim());
                results.push({ tool: parsed.tool, path: parsed.path, content: parsed.content, command: parsed.command });
            }
            catch { }
        }
        return results;
    }
    async processWithAgent(message, filePaths, images, useModel) {
        const model = useModel || this._currentModel;
        const messages = [];
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '未打开工作区';
        const hasVision = images && images.length > 0 && this._isVisionModel(model);
        let systemContent = `你是一个智能编程助手，运行在 VS Code 中。你可以：
1. 回答编程问题
2. 创建和编辑文件（返回 JSON 格式的工具调用）
3. 执行终端命令

当需要创建文件或执行命令时，使用以下格式：

\`\`\`tool
{"tool": "create_file", "path": "相对路径", "content": "文件内容"}
\`\`\`

\`\`\`tool
{"tool": "edit_file", "path": "相对路径", "content": "新内容"}
\`\`\`

\`\`\`tool
{"tool": "run_command", "command": "要执行的命令"}
\`\`\`

当前工作目录: ${workspacePath}
请用中文回复。`;
        if (hasVision) {
            systemContent += '\n\n用户可能会发送图片，请分析图片内容并结合问题回答。';
        }
        if (this._visionModel && this._visionModel !== this._currentModel) {
            systemContent += `\n\n## 模型协作
当前你是 ${model} 模型。如果用户的需求更适合由另一个模型处理，你可以使用 handoff 机制将任务传递给另一个模型：

\`\`\`handoff
{"target": "vision", "prompt": "请分析这张图片中的UI布局"}
\`\`\`

\`\`\`handoff
{"target": "text", "prompt": "请根据以下分析结果编写代码..."}
\`\`\`

handoff 场景：
- 用户要求分析/识别图片 → 你是文本模型时，handoff 给 vision 模型
- 视觉模型分析完图片后 → handoff 回 text 模型继续编码
- 用户要求生成/设计图片 → handoff 给 vision 模型

不需要 handoff 时正常回答即可。`;
        }
        messages.push({ role: 'system', content: systemContent });
        if (filePaths && filePaths.length > 0) {
            for (const fp of filePaths) {
                try {
                    const content = fs.readFileSync(fp, 'utf-8');
                    const fileName = path.basename(fp);
                    messages.push({ role: 'user', content: `[文件: ${fileName}]\n\`\`\`\n${content.slice(0, 30000)}\n\`\`\`` });
                    messages.push({ role: 'assistant', content: `已读取文件 ${fileName}，请问你想对这个文件做什么？` });
                }
                catch (e) { }
            }
        }
        if (hasVision && images) {
            messages.push({ role: 'user', content: message, images: images });
        }
        else {
            const session = this._getActiveSession();
            if (session) {
                for (const msg of session.messages.slice(-10)) {
                    if (msg.role === 'system') {
                        continue;
                    }
                    const m = { role: msg.role, content: msg.content };
                    if (msg.images && msg.images.length > 0 && this._isVisionModel(model)) {
                        m.images = msg.images;
                    }
                    messages.push(m);
                }
            }
        }
        const wantsSearch = /搜索|查找|search|find|哪里|where|代码|相关/i.test(message);
        if (wantsSearch) {
            try {
                const relevantCode = await this.codebaseIndexer.search(message);
                if (relevantCode) {
                    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
                    if (lastUserMsg) {
                        lastUserMsg.content = `相关代码片段:\n${relevantCode}\n\n用户问题: ${message}`;
                    }
                }
            }
            catch (e) { }
        }
        let fullResponse = '';
        await this.ollamaClient.chat(model, messages, (chunk) => {
            if (this._isAborted()) {
                return;
            }
            fullResponse += chunk;
            this._view?.webview.postMessage({ type: 'streamChunk', chunk });
        }, (progress) => {
            this._view?.webview.postMessage({
                type: 'progress', percent: progress.percent,
                tokensGenerated: progress.tokensGenerated, tokensTotal: progress.tokensTotal
            });
        });
        return fullResponse;
    }
    async indexProject() {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('请先打开一个文件夹');
            return;
        }
        this._view?.webview.postMessage({ type: 'addMessage', message: { role: 'assistant', content: '⏳ 正在索引项目...' } });
        try {
            await this.codebaseIndexer.indexWorkspace(vscode.workspace.workspaceFolders[0].uri.fsPath);
            this._view?.webview.postMessage({ type: 'addMessage', message: { role: 'assistant', content: '✅ 项目索引完成！' } });
        }
        catch (error) {
            this._view?.webview.postMessage({ type: 'addError', error: `索引失败: ${error.message}` });
        }
    }
    _getHtmlForWebview(webview) {
        const activeSessionId = this._activeSessionId;
        return `<!DOCTYPE html>
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

        /* ── Header ── */
        .header {
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex; gap: 8px; align-items: center;
            flex-shrink: 0;
        }
        .header .title { font-weight: 600; font-size: 13px; }
        .header .spacer { flex: 1; }
        .settings-btn {
            width: 28px; height: 28px;
            display: flex; align-items: center; justify-content: center;
            background: none; border: none; cursor: pointer;
            color: var(--vscode-descriptionForeground);
            border-radius: 4px; font-size: 14px;
            transition: all 0.15s;
        }
        .settings-btn:hover {
            background: var(--vscode-toolbar-hoverBackground);
            color: var(--vscode-editor-foreground);
        }
        .header button {
            padding: 4px 10px;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none; border-radius: 4px; cursor: pointer; font-size: 11px;
        }
        .header button:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .header button.new-chat { background: var(--vscode-button-background); color: var(--vscode-button-foreground); font-weight: 500; }
        .header button.new-chat:hover { background: var(--vscode-button-hoverBackground); }

        /* ── Session sidebar ── */
        .session-bar {
            display: none; border-bottom: 1px solid var(--vscode-panel-border);
            max-height: 150px; overflow-y: auto; flex-shrink: 0;
        }
        .session-bar.open { display: block; }
        .session-item {
            display: flex; align-items: center;
            padding: 6px 12px; cursor: pointer; font-size: 12px; gap: 6px;
        }
        .session-item:hover { background: var(--vscode-list-hoverBackground); }
        .session-item.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
        .session-item .session-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .session-item .session-delete {
            opacity: 0; background: none; border: none;
            color: var(--vscode-descriptionForeground);
            cursor: pointer; font-size: 11px; padding: 2px 4px;
        }
        .session-item:hover .session-delete { opacity: 1; }

        /* ── Messages ── */
        #messages {
            flex: 1; overflow-y: auto; padding: 12px;
            display: flex; flex-direction: column; gap: 10px;
        }
        .msg-wrapper { display: flex; flex-direction: column; max-width: 88%; }
        .msg-wrapper.user { align-self: flex-end; align-items: flex-end; }
        .msg-wrapper.assistant { align-self: flex-start; align-items: flex-start; }

        /* ── Relay messages — weakened ── */
        .msg-wrapper.relay {
            opacity: 0.5; max-width: 80%; transition: opacity 0.3s;
        }
        .msg-wrapper.relay:hover { opacity: 1; }
        .msg-wrapper.relay .message {
            font-size: 12px;
            background: var(--vscode-editor-background);
            border: 1px dashed var(--vscode-panel-border);
            border-radius: 8px; padding: 8px 12px;
        }
        .msg-label {
            font-size: 10px; margin-bottom: 3px;
            display: flex; align-items: center; gap: 4px;
        }
        .msg-label .model-name {
            color: var(--vscode-descriptionForeground);
            opacity: 0.5; font-size: 9px; font-weight: 400;
        }
        .msg-label .model-name.vision::before { content: '👁 '; font-size: 8px; }
        .msg-label .relay-badge {
            font-size: 9px; color: var(--vscode-descriptionForeground);
            background: var(--vscode-editor-inactiveSelectionBackground);
            padding: 1px 5px; border-radius: 3px; opacity: 0.7;
        }

        /* ── Tool execution card ── */
        .tool-card {
            display: flex; flex-direction: column;
            padding: 8px 12px; margin: 2px 0;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px; font-size: 12px;
            max-width: 88%; align-self: flex-start;
        }
        .tool-card-header {
            display: flex; align-items: center; gap: 6px;
            font-weight: 500;
        }
        .tool-card-header .tool-icon { font-size: 13px; }
        .tool-card-header .tool-name { color: var(--vscode-editor-foreground); }
        .tool-card-header .tool-detail {
            color: var(--vscode-descriptionForeground);
            opacity: 0.7; font-size: 11px; flex: 1;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .tool-card-header .tool-status {
            font-size: 11px; font-weight: 400;
        }
        .tool-card-header .tool-status.running {
            color: var(--vscode-editorWarning-foreground, #cca700);
        }
        .tool-card-header .tool-status.done {
            color: var(--vscode-editorInfo-foreground, #3794ff);
        }
        .tool-card-header .tool-status.error {
            color: var(--vscode-editorError-foreground, #f48771);
        }
        .tool-card-body {
            margin-top: 4px; padding: 4px 8px;
            background: var(--vscode-textCodeBlock-background, rgba(255,255,255,0.05));
            border-radius: 4px; font-size: 11px;
            color: var(--vscode-descriptionForeground);
            white-space: pre-wrap; word-break: break-all;
            max-height: 120px; overflow-y: auto;
            display: none;
        }
        .tool-card-body.visible { display: block; }

        /* Model-switch indicator */
        .model-indicator {
            display: flex; align-items: center; gap: 6px;
            padding: 4px 10px; margin: 2px 0;
            font-size: 11px; color: var(--vscode-descriptionForeground);
            border-left: 2px solid #c586c0;
            background: rgba(197, 134, 192, 0.06);
        }
        .model-indicator.vision { border-left-color: #dcdcaa; }
        .model-indicator.text { border-left-color: #4ec9b0; }

        .message {
            padding: 10px 14px; border-radius: 12px;
            word-wrap: break-word; white-space: pre-wrap;
            font-size: 13px; line-height: 1.5;
        }
        .message.user {
            background: var(--vscode-button-background); color: var(--vscode-button-foreground);
            border-bottom-right-radius: 4px;
        }
        .message.assistant {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-bottom-left-radius: 4px;
        }
        .message.assistant.vision {
            border-left: 2px solid rgba(220, 220, 170, 0.4);
        }
        .message.assistant:empty::after { content: '思考中...'; opacity: 0.5; font-style: italic; }
        .message.error {
            background: rgba(255, 0, 0, 0.1); border: 1px solid rgba(255, 0, 0, 0.3);
            color: #f48771; border-radius: 8px; align-self: center;
        }

        /* ── Progress bar ── */
        .progress-bar-wrapper { padding: 2px 12px 6px 12px; flex-shrink: 0; }
        .progress-bar-track {
            width: 100%; height: 3px;
            background: var(--vscode-progressBar-background, rgba(255,255,255,0.1));
            border-radius: 2px; overflow: hidden;
        }
        .progress-bar-fill {
            height: 100%; width: 0%;
            background: var(--vscode-button-background, #007acc);
            border-radius: 2px; transition: width 0.3s ease;
        }
        .progress-bar-text {
            font-size: 10px; color: var(--vscode-descriptionForeground);
            text-align: right; margin-top: 1px; opacity: 0.7;
        }

        /* ── Loading indicator ── */
        .loading-indicator {
            display: none; padding: 4px 12px; font-size: 11px;
            color: var(--vscode-descriptionForeground);
            border-bottom: 1px solid var(--vscode-panel-border); flex-shrink: 0;
            align-items: center; gap: 8px;
        }
        .loading-indicator.active { display: flex; }
        .loading-indicator .model-label { font-weight: 500; opacity: 0.8; }

        /* ── Input area ── */
        .input-area {
            padding: 10px 12px;
            border-top: 1px solid var(--vscode-panel-border); flex-shrink: 0;
        }
        .context-preview { display: flex; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
        .context-chip {
            display: flex; align-items: center; gap: 4px;
            padding: 3px 8px; background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border, transparent);
            border-radius: 12px; font-size: 11px; max-width: 160px;
        }
        .context-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
        .context-chip .remove-chip { cursor: pointer; opacity: 0.6; font-size: 14px; line-height: 1; }
        .context-chip .remove-chip:hover { opacity: 1; }
        .context-chip.img-chip { border-color: rgba(220, 220, 170, 0.4); }

        textarea {
            width: 100%; min-height: 48px; max-height: 200px;
            padding: 8px 10px; background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, transparent);
            border-radius: 6px; resize: vertical; font-family: inherit;
            font-size: 13px; line-height: 1.4;
        }
        textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
        textarea:disabled { opacity: 0.5; }

        .input-actions { display: flex; gap: 6px; margin-top: 6px; align-items: center; }
        button.send {
            flex: 1; padding: 6px 16px;
            background: var(--vscode-button-background); color: var(--vscode-button-foreground);
            border: none; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 13px;
        }
        button.send:hover { background: var(--vscode-button-hoverBackground); }
        button.send:disabled { opacity: 0.5; cursor: not-allowed; }
        button.stop-btn {
            flex: 1; padding: 6px 16px;
            background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-input-border, transparent);
            border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 13px;
            display: none;
        }
        button.stop-btn:hover { background: rgba(255, 80, 80, 0.15); border-color: rgba(255, 80, 80, 0.4); color: #f48771; }
        button.stop-btn.visible { display: block; }

        /* Spinner animation */
        @keyframes spin { to { transform: rotate(360deg); } }
        .spinner {
            display: inline-block; width: 12px; height: 12px;
            border: 2px solid var(--vscode-descriptionForeground);
            border-right-color: transparent; border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
    </style>
</head>
<body>
    <div class="header">
        <span class="title">🤖 Ollama Agent</span>
        <span class="spacer"></span>
        <button class="settings-btn" onclick="configureModels()" title="配置模型">⚙</button>
        <button class="new-chat" onclick="newChat()">＋ 新对话</button>
        <button onclick="toggleSessions()">📋 历史</button>
    </div>

    <div id="sessionBar" class="session-bar"></div>
    <div id="loadingIndicator" class="loading-indicator">
        <span class="spinner"></span>
        <span id="loadingModelLabel" class="model-label"></span>
    </div>
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

    <script>
        const vscode = acquireVsCodeApi();
        let contextFiles = [];
        let contextImages = [];
        let isLoading = false;

        const inputEl = document.getElementById('input');
        const sendBtn = document.getElementById('sendBtn');
        const stopBtn = document.getElementById('stopBtn');
        const loadingEl = document.getElementById('loadingIndicator');
        const loadingModelLabel = document.getElementById('loadingModelLabel');
        const progressWrapper = document.getElementById('progressWrapper');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');

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

            // Toggle send / stop buttons
            sendBtn.style.display = loading ? 'none' : 'block';
            stopBtn.classList.toggle('visible', loading);

            if (model) { loadingModelLabel.textContent = model + ' 生成中...'; }
            if (!loading) {
                progressWrapper.style.display = 'none';
                progressFill.style.width = '0%';
                progressText.textContent = '0%';
            }
        }

        function updateProgress(percent) {
            if (percent <= 0) return;
            progressWrapper.style.display = 'block';
            progressFill.style.width = Math.min(percent, 100) + '%';
            progressText.textContent = Math.round(percent) + '%';
        }

        function stopGeneration() {
            vscode.postMessage({ type: 'stop' });
        }

        function newChat() {
            vscode.postMessage({ type: 'newChat' });
            document.getElementById('messages').innerHTML = '';
            contextFiles = []; contextImages = [];
            renderContextPreview();
        }

        function toggleSessions() {
            const bar = document.getElementById('sessionBar');
            bar.classList.toggle('open');
            if (bar.classList.contains('open')) { vscode.postMessage({ type: 'requestSessionList' }); }
        }

        function configureModels() { vscode.postMessage({ type: 'configureModels' }); }

        function renderContextPreview() {
            const el = document.getElementById('contextPreview');
            el.innerHTML = '';
            contextFiles.forEach((f, i) => {
                const chip = document.createElement('div');
                chip.className = 'context-chip';
                chip.innerHTML = '<span>📄 ' + escHtml(f.name) + '</span><span class="remove-chip" data-idx="' + i + '" data-type="file">&times;</span>';
                el.appendChild(chip);
            });
            contextImages.forEach((img, i) => {
                const chip = document.createElement('div');
                chip.className = 'context-chip img-chip';
                chip.innerHTML = '<span>🖼 图片 ' + (i + 1) + '</span><span class="remove-chip" data-idx="' + i + '" data-type="image">&times;</span>';
                el.appendChild(chip);
            });
            el.querySelectorAll('.remove-chip').forEach(btn => {
                btn.onclick = () => {
                    const idx = parseInt(btn.dataset.idx);
                    if (btn.dataset.type === 'image') { contextImages.splice(idx, 1); }
                    else { contextFiles.splice(idx, 1); }
                    renderContextPreview();
                };
            });
        }

        function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

        function sendMessage() {
            const message = inputEl.value.trim();
            const files = contextFiles.length > 0 ? contextFiles.map(f => f.path) : undefined;
            const images = contextImages.length > 0 ? contextImages : undefined;
            if (!message && !files && !images) return;
            if (isLoading) return;
            vscode.postMessage({ type: 'sendMessage', message, files, images });
            inputEl.value = '';
            contextFiles = []; contextImages = [];
            renderContextPreview();
        }

        function appendMessage(role, content, msgModel, isVision, isRelay) {
            const messages = document.getElementById('messages');
            const wrapper = document.createElement('div');
            wrapper.className = 'msg-wrapper ' + role + (isRelay ? ' relay' : '');
            if (role === 'assistant') {
                const label = document.createElement('div');
                label.className = 'msg-label';
                const nameClass = isVision ? 'model-name vision' : 'model-name';
                let labelHtml = '<span class="' + nameClass + '">' + escHtml(msgModel || '') + '</span>';
                if (isRelay) { labelHtml += '<span class="relay-badge">接力</span>'; }
                label.innerHTML = labelHtml;
                wrapper.appendChild(label);
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

        /** Add or update a tool execution card */
        function updateToolCard(data) {
            const messages = document.getElementById('messages');
            let card = document.getElementById(data.toolId);

            if (!card) {
                // Create new card
                card = document.createElement('div');
                card.className = 'tool-card';
                card.id = data.toolId;

                const iconMap = { create_file: '📄', edit_file: '✏️', run_command: '⚡' };
                const icon = iconMap[data.tool] || '🔧';
                const nameMap = { create_file: '创建文件', edit_file: '编辑文件', run_command: '执行命令' };
                const name = nameMap[data.tool] || data.tool;
                const detail = data.path || data.command || '';

                const header = document.createElement('div');
                header.className = 'tool-card-header';
                header.innerHTML =
                    '<span class="tool-icon">' + icon + '</span>' +
                    '<span class="tool-name">' + escHtml(name) + '</span>' +
                    '<span class="tool-detail">' + escHtml(detail) + '</span>' +
                    '<span class="tool-status running"><span class="spinner" style="width:10px;height:10px;border-width:1.5px"></span> 执行中</span>';
                card.appendChild(header);

                const body = document.createElement('div');
                body.className = 'tool-card-body';
                card.appendChild(body);

                messages.appendChild(card);
                messages.scrollTop = messages.scrollHeight;
            }

            // Update status
            if (data.status && data.status !== 'running') {
                const statusEl = card.querySelector('.tool-status');
                const bodyEl = card.querySelector('.tool-card-body');
                if (statusEl) {
                    if (data.status === 'done') {
                        statusEl.className = 'tool-status done';
                        statusEl.textContent = '✓ 完成';
                    } else if (data.status === 'error') {
                        statusEl.className = 'tool-status error';
                        statusEl.textContent = '✗ 失败';
                    }
                }
                if (bodyEl && data.result) {
                    bodyEl.textContent = data.result;
                    bodyEl.classList.add('visible');
                }
                messages.scrollTop = messages.scrollHeight;
            }
        }

        window.addEventListener('message', (event) => {
            const data = event.data;
            const messages = document.getElementById('messages');

            switch (data.type) {
                case 'addMessage': {
                    const isVision = data.isVision || false;
                    const isRelay = data.isRelay || false;
                    const msgModel = data.modelTag || data.message.model || '';
                    appendMessage(data.message.role, data.message.content, msgModel, isVision, isRelay);
                    break;
                }

                case 'addModelIndicator': {
                    addModelIndicator(data.fromModel || '', data.toModel || data.model || '', data.indicator);
                    break;
                }

                case 'toolStatus': {
                    updateToolCard(data);
                    break;
                }

                case 'progress': {
                    updateProgress(data.percent);
                    break;
                }

                case 'addError': {
                    const errDiv = document.createElement('div');
                    errDiv.className = 'message error';
                    errDiv.textContent = '❌ ' + data.error;
                    messages.appendChild(errDiv);
                    messages.scrollTop = messages.scrollHeight;
                    break;
                }

                case 'streamChunk': {
                    let lastWrapper = messages.lastElementChild;
                    while (lastWrapper && (lastWrapper.classList.contains('model-indicator') || lastWrapper.classList.contains('tool-card'))) {
                        lastWrapper = lastWrapper.previousElementSibling;
                    }
                    if (lastWrapper && lastWrapper.classList.contains('assistant')) {
                        let lastMsg = lastWrapper.querySelector('.message.assistant');
                        if (lastMsg) { lastMsg.textContent += data.chunk; }
                    }
                    messages.scrollTop = messages.scrollHeight;
                    break;
                }

                case 'updateLastAssistant': {
                    let lastWrapper = messages.lastElementChild;
                    while (lastWrapper && (lastWrapper.classList.contains('model-indicator') || lastWrapper.classList.contains('tool-card'))) {
                        lastWrapper = lastWrapper.previousElementSibling;
                    }
                    if (lastWrapper && lastWrapper.classList.contains('assistant')) {
                        let lastMsg = lastWrapper.querySelector('.message.assistant');
                        if (lastMsg) { lastMsg.textContent = data.content; }
                    }
                    messages.scrollTop = messages.scrollHeight;
                    break;
                }

                case 'removeLastAssistant': {
                    let lastWrapper = messages.lastElementChild;
                    while (lastWrapper && (lastWrapper.classList.contains('model-indicator') || lastWrapper.classList.contains('tool-card'))) {
                        messages.removeChild(lastWrapper);
                        lastWrapper = messages.lastElementChild;
                    }
                    if (lastWrapper && lastWrapper.classList.contains('assistant')) {
                        messages.removeChild(lastWrapper);
                    }
                    break;
                }

                case 'removeLastAssistantIfEmpty': {
                    let lastWrapper = messages.lastElementChild;
                    while (lastWrapper && (lastWrapper.classList.contains('model-indicator') || lastWrapper.classList.contains('tool-card'))) {
                        lastWrapper = lastWrapper.previousElementSibling;
                    }
                    if (lastWrapper && lastWrapper.classList.contains('assistant')) {
                        let lastMsg = lastWrapper.querySelector('.message.assistant');
                        if (lastMsg && !lastMsg.textContent.trim()) {
                            messages.removeChild(lastWrapper);
                        }
                    }
                    break;
                }

                case 'setLoading': { setLoading(data.loading, data.model); break; }

                case 'refillInput': {
                    inputEl.value = data.message || '';
                    // Restore context files/images
                    contextFiles = [];
                    contextImages = [];
                    if (data.files) {
                        for (const fp of data.files) {
                            const name = fp.split(/[\\\\/]/).pop();
                            contextFiles.push({ path: fp, name });
                        }
                    }
                    if (data.images) { contextImages = data.images; }
                    renderContextPreview();
                    inputEl.focus();
                    break;
                }

                case 'configChanged': { break; }
                case 'modelsUpdated': { break; }

                case 'filesAdded': {
                    if (data.files) {
                        for (const fp of data.files) {
                            const name = fp.split(/[\\\\/]/).pop();
                            contextFiles.push({ path: fp, name });
                        }
                        renderContextPreview();
                    }
                    break;
                }

                case 'sessionReset': {
                    document.getElementById('messages').innerHTML = '';
                    activeSessionId = data.sessionId;
                    break;
                }

                case 'sessionLoaded': {
                    document.getElementById('messages').innerHTML = '';
                    if (data.session) {
                        activeSessionId = data.session.id;
                        if (data.session.messages) {
                            for (const msg of data.session.messages) {
                                const isVis = msg.images && msg.images.length > 0;
                                appendMessage(msg.role, msg.content, msg.model, isVis, false);
                            }
                            messages.scrollTop = messages.scrollHeight;
                        }
                    }
                    break;
                }

                case 'sessionList': {
                    const bar = document.getElementById('sessionBar');
                    bar.innerHTML = '';
                    if (data.sessions) {
                        for (const s of data.sessions) {
                            const item = document.createElement('div');
                            item.className = 'session-item' + (s.id === activeSessionId ? ' active' : '');
                            item.innerHTML = '<span class="session-title">' + escHtml(s.title) + '</span><button class="session-delete" data-id="' + s.id + '">&times;</button>';
                            item.querySelector('.session-title').onclick = () => {
                                vscode.postMessage({ type: 'switchSession', sessionId: s.id });
                            };
                            item.querySelector('.session-delete').onclick = (e) => {
                                e.stopPropagation();
                                vscode.postMessage({ type: 'deleteSession', sessionId: s.id });
                            };
                            bar.appendChild(item);
                        }
                    }
                    break;
                }

                case 'sessionTitleUpdate': {
                    const bar = document.getElementById('sessionBar');
                    if (bar.classList.contains('open')) { vscode.postMessage({ type: 'requestSessionList' }); }
                    break;
                }
            }
        });

        let activeSessionId = '${activeSessionId}';
    </script>
</body>
</html>`;
    }
}
exports.ChatViewProvider = ChatViewProvider;
//# sourceMappingURL=chatViewProvider.js.map