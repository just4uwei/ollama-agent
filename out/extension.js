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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const chatViewProvider_1 = require("./chatViewProvider");
const chatPanel_1 = require("./chatPanel");
const ollamaClient_1 = require("./ollamaClient");
const codebaseTools_1 = require("./tools/codebaseTools");
const PROJECT_SKILL_DIR = '.ollama-agent';
const PROJECT_SKILL_FILE = 'project-skill.md';
function activate(context) {
    console.log('Ollama Agent is now active!');
    const config = vscode.workspace.getConfiguration('ollamaAgent');
    const model = config.get('model', 'qwen3-coder:30b');
    const visionModel = config.get('visionModel', '');
    const apiBase = config.get('apiBase', 'http://localhost:11434');
    const embeddingModel = config.get('embeddingModel', 'nomic-embed-text');
    const ollamaClient = new ollamaClient_1.OllamaClient(apiBase);
    const codebaseIndexer = new codebaseTools_1.CodebaseIndexer(ollamaClient, embeddingModel);
    // Fetch available models
    let availableModels = [];
    ollamaClient.listModels().then(models => {
        availableModels = models.map((m) => m.name);
    }).catch(() => {
        availableModels = [model];
    });
    // Register chat view (bottom/activitybar)
    const chatProvider = new chatViewProvider_1.ChatViewProvider(context.extensionUri, ollamaClient, codebaseIndexer, model, availableModels, visionModel, context.workspaceState);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('ollamaAgent.chatView', chatProvider));
    // ── Right-side ChatPanel ──────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('ollamaAgent.openChat', () => {
        const panel = chatPanel_1.ChatPanel.openOrReveal(context.extensionUri);
        panel.postMessage({ type: 'configChanged', textModel: model, visionModel });
        const session = chatProvider.getActiveSession();
        if (session) {
            panel.postMessage({ type: 'sessionLoaded', session });
        }
    }));
    // Forward ChatPanel messages to chatProvider
    context.subscriptions.push(vscode.commands.registerCommand('ollamaAgent.chatPanelMessage', async (data) => {
        await chatProvider.handlePanelMessage(data);
    }));
    // ── Active Editor Context ──────────────────────────────────────────
    let addEditorTimeout;
    function scheduleAddActiveEditor() {
        if (addEditorTimeout) {
            clearTimeout(addEditorTimeout);
        }
        addEditorTimeout = setTimeout(() => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            const doc = editor.document;
            if (doc.uri.scheme !== 'file') {
                return;
            }
            const skipExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.exe', '.dll', '.bin', '.zip', '.tar', '.gz'];
            if (skipExts.some(ext => doc.fileName.toLowerCase().endsWith(ext))) {
                return;
            }
            chatProvider.addFileFromContext(doc.uri.fsPath);
        }, 500);
    }
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        scheduleAddActiveEditor();
    }));
    // ── Register commands ───────────────────────────────────────────────
    // ── Auto-generate project-skill.md ─────────────────────────────────
    function generateProjectSkill() {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return;
        }
        const wsPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        try {
            const structure = codebaseIndexer.analyzeProjectStructure(wsPath);
            const skillDir = path.join(wsPath, PROJECT_SKILL_DIR);
            if (!fs.existsSync(skillDir)) {
                fs.mkdirSync(skillDir, { recursive: true });
            }
            const skillFile = path.join(skillDir, PROJECT_SKILL_FILE);
            fs.writeFileSync(skillFile, structure, 'utf-8');
            console.log('Project skill generated:', skillFile);
        }
        catch (e) {
            console.error('Failed to generate project skill:', e);
        }
    }
    // Generate on startup (delayed)
    setTimeout(generateProjectSkill, 5000);
    // Re-generate when files change
    const skillWatcher = vscode.workspace.createFileSystemWatcher('**/*', false, true, false);
    let skillDebounce;
    skillWatcher.onDidChange(() => {
        if (skillDebounce) {
            clearTimeout(skillDebounce);
        }
        skillDebounce = setTimeout(generateProjectSkill, 10000);
    });
    skillWatcher.onDidCreate(() => {
        if (skillDebounce) {
            clearTimeout(skillDebounce);
        }
        skillDebounce = setTimeout(generateProjectSkill, 10000);
    });
    skillWatcher.onDidDelete(() => {
        if (skillDebounce) {
            clearTimeout(skillDebounce);
        }
        skillDebounce = setTimeout(generateProjectSkill, 10000);
    });
    context.subscriptions.push(skillWatcher);
    context.subscriptions.push(vscode.commands.registerCommand('ollamaAgent.indexProject', async () => {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('请先打开一个文件夹');
            return;
        }
        await codebaseIndexer.indexWorkspace(vscode.workspace.workspaceFolders[0].uri.fsPath);
        vscode.window.showInformationMessage('项目索引完成！');
    }));
    codebaseIndexer.startAutoIndex(context);
    context.subscriptions.push(vscode.commands.registerCommand('ollamaAgent.switchModel', async () => {
        try {
            const models = await ollamaClient.listModels();
            availableModels = models.map((m) => m.name);
        }
        catch (e) { }
        if (availableModels.length === 0) {
            vscode.window.showWarningMessage('未找到可用模型，请确认 Ollama 正在运行');
            return;
        }
        const currentModel = chatProvider.getCurrentModel();
        const items = availableModels.map(name => ({
            label: name,
            description: name === currentModel ? '● 当前' : '',
            detail: name
        }));
        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: `当前: ${currentModel} — 选择模型`
        });
        if (picked) {
            chatProvider.switchModel(picked.label);
            vscode.window.showInformationMessage(`已切换模型: ${picked.label}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ollamaAgent.addFileToContext', (uri) => {
        const fileUri = uri || vscode.window.activeTextEditor?.document.uri;
        if (!fileUri || fileUri.scheme !== 'file') {
            vscode.window.showWarningMessage('请选择一个本地文件');
            return;
        }
        chatProvider.addFileFromContext(fileUri.fsPath);
    }));
    // ── Restart Ollama Service ───────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('ollamaAgent.restartOllama', async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '🔄 重启 Ollama 服务',
            cancellable: false
        }, async (progress) => {
            progress.report({ message: '正在停止 Ollama 进程...', increment: 0 });
            // Step 1: Kill ollama process
            const { execSync } = require('child_process');
            try {
                execSync('taskkill /F /IM ollama.exe 2>nul', { stdio: 'ignore' });
            }
            catch (_) { /* ignore */ }
            try {
                execSync('taskkill /F /IM "ollama app.exe" 2>nul', { stdio: 'ignore' });
            }
            catch (_) { /* ignore */ }
            progress.report({ message: '已停止，正在释放显存...', increment: 30 });
            await new Promise(resolve => setTimeout(resolve, 3000));
            // Step 2: Restart ollama serve (detached, hidden)
            progress.report({ message: '正在重新启动 Ollama...', increment: 50 });
            try {
                const { spawn } = require('child_process');
                const proc = spawn('ollama', ['serve'], {
                    detached: true,
                    stdio: 'ignore',
                    shell: true,
                    windowsHide: true
                });
                proc.unref();
            }
            catch (e) {
                vscode.window.showWarningMessage('自动启动失败，请手动运行: ollama serve');
            }
            // Step 3: Wait for recovery (poll /api/tags)
            progress.report({ message: '等待 Ollama 恢复...', increment: 60 });
            let recovered = false;
            const maxRetries = 15;
            for (let i = 0; i < maxRetries; i++) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                try {
                    const models = await ollamaClient.listModels();
                    availableModels = models.map((m) => m.name);
                    chatProvider.updateAvailableModels(availableModels);
                    recovered = true;
                    break;
                }
                catch (_) {
                    progress.report({
                        message: `等待恢复 (${i + 1}/${maxRetries})...`,
                        increment: 2
                    });
                }
            }
            if (recovered) {
                progress.report({ message: `✅ Ollama 已恢复！${availableModels.length} 个模型可用`, increment: 100 });
                vscode.window.showInformationMessage(`✅ Ollama 已重启，${availableModels.length} 个模型可用`);
                chatProvider.handlePanelMessage({ type: 'ollamaRestarted', models: availableModels });
            }
            else {
                progress.report({ message: '⚠️ 恢复超时，请手动检查', increment: 100 });
                vscode.window.showWarningMessage('⚠️ Ollama 重启超时，请手动运行 ollama serve');
                chatProvider.handlePanelMessage({ type: 'ollamaRestartFailed' });
            }
        });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('ollamaAgent.configureModels', async () => {
        const cfg = vscode.workspace.getConfiguration('ollamaAgent');
        const curText = cfg.get('model', 'qwen3-coder:30b');
        const curVision = cfg.get('visionModel', '') || '未设置';
        const options = [
            { label: '$(globe) 配置文本模型', description: curText, action: 'textModel' },
            { label: '$(eye) 配置视觉模型', description: curVision, action: 'visionModel' },
            { label: '$(refresh) 刷新模型列表', description: '从 Ollama 重新获取', action: 'refresh' }
        ];
        const picked = await vscode.window.showQuickPick(options, { placeHolder: '选择要配置的模型类型' });
        if (!picked) {
            return;
        }
        if (picked.action === 'refresh') {
            try {
                const models = await ollamaClient.listModels();
                availableModels = models.map((m) => m.name);
                chatProvider.updateAvailableModels(availableModels);
                vscode.window.showInformationMessage(`已刷新，共 ${availableModels.length} 个模型`);
            }
            catch (e) {
                vscode.window.showErrorMessage('获取模型列表失败');
            }
            return;
        }
        try {
            const models = await ollamaClient.listModels();
            availableModels = models.map((m) => m.name);
        }
        catch (e) { }
        const modelItems = [...availableModels.map(name => ({ label: name })), { label: '$(edit) 手动输入模型名...' }];
        const selected = await vscode.window.showQuickPick(modelItems, {
            placeHolder: `选择${picked.action === 'textModel' ? '文本' : '视觉'}模型`
        });
        if (!selected) {
            return;
        }
        let modelName = selected.label;
        if (modelName === '$(edit) 手动输入模型名...') {
            const input = await vscode.window.showInputBox({ prompt: '输入模型名称' });
            if (!input) {
                return;
            }
            modelName = input;
        }
        if (picked.action === 'textModel') {
            await cfg.update('model', modelName, vscode.ConfigurationTarget.Global);
            chatProvider.switchModel(modelName);
            vscode.window.showInformationMessage(`文本模型已设为: ${modelName}`);
        }
        else {
            await cfg.update('visionModel', modelName, vscode.ConfigurationTarget.Global);
            chatProvider.switchVisionModel(modelName);
            vscode.window.showInformationMessage(`视觉模型已设为: ${modelName}`);
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('ollamaAgent.model')) {
            const newModel = vscode.workspace.getConfiguration('ollamaAgent').get('model', 'qwen3-coder:30b');
            chatProvider.switchModel(newModel);
        }
        if (e.affectsConfiguration('ollamaAgent.visionModel')) {
            const newVision = vscode.workspace.getConfiguration('ollamaAgent').get('visionModel', '');
            chatProvider.switchVisionModel(newVision);
        }
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map