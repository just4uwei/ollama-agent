import * as vscode from 'vscode';
import { ChatViewProvider } from './chatViewProvider';
import { OllamaClient } from './ollamaClient';
import { CodebaseIndexer } from './tools/codebaseTools';

export function activate(context: vscode.ExtensionContext) {
    console.log('Ollama Agent is now active!');

    const config = vscode.workspace.getConfiguration('ollamaAgent');
    const model = config.get<string>('model', 'qwen3-coder:30b');
    const visionModel = config.get<string>('visionModel', '');
    const apiBase = config.get<string>('apiBase', 'http://localhost:11434');
    const embeddingModel = config.get<string>('embeddingModel', 'nomic-embed-text');

    const ollamaClient = new OllamaClient(apiBase);
    const codebaseIndexer = new CodebaseIndexer(ollamaClient, embeddingModel);

    // Fetch available models
    let availableModels: string[] = [];
    ollamaClient.listModels().then(models => {
        availableModels = models.map(m => m.name);
    }).catch(() => {
        availableModels = [model];
    });

    // Register chat view
    const chatProvider = new ChatViewProvider(
        context.extensionUri,
        ollamaClient,
        codebaseIndexer,
        model,
        availableModels,
        visionModel
    );

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'ollamaAgent.chatView',
            chatProvider
        )
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('ollamaAgent.openChat', () => {
            vscode.commands.executeCommand('workbench.view.extension.ollama-agent');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ollamaAgent.indexProject', async () => {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showWarningMessage('请先打开一个文件夹');
                return;
            }
            await codebaseIndexer.indexWorkspace(vscode.workspace.workspaceFolders[0].uri.fsPath);
            vscode.window.showInformationMessage('项目索引完成！');
        })
    );

    // Start automatic indexing
    codebaseIndexer.startAutoIndex(context);

    // Register switch model command
    context.subscriptions.push(
        vscode.commands.registerCommand('ollamaAgent.switchModel', async () => {
            try {
                const models = await ollamaClient.listModels();
                availableModels = models.map(m => m.name);
            } catch (e) {}

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
        })
    );

    // Register "Add to Ollama Agent" — right-click context menu
    context.subscriptions.push(
        vscode.commands.registerCommand('ollamaAgent.addFileToContext', (uri?: vscode.Uri) => {
            const fileUri = uri || vscode.window.activeTextEditor?.document.uri;
            if (!fileUri || fileUri.scheme !== 'file') {
                vscode.window.showWarningMessage('请选择一个本地文件');
                return;
            }
            vscode.commands.executeCommand('workbench.view.extension.ollama-agent');
            chatProvider.addFileFromContext(fileUri.fsPath);
        })
    );

    // Register configure models command — with immediate feedback
    context.subscriptions.push(
        vscode.commands.registerCommand('ollamaAgent.configureModels', async () => {
            const cfg = vscode.workspace.getConfiguration('ollamaAgent');
            const curText = cfg.get<string>('model', 'qwen3-coder:30b');
            const curVision = cfg.get<string>('visionModel', '') || '未设置';

            const options = [
                { label: '$(globe) 配置文本模型', description: curText, action: 'textModel' },
                { label: '$(eye) 配置视觉模型', description: curVision, action: 'visionModel' },
                { label: '$(refresh) 刷新模型列表', description: '从 Ollama 重新获取', action: 'refresh' }
            ];
            const picked = await vscode.window.showQuickPick(options, { placeHolder: '选择要配置的模型类型' });
            if (!picked) { return; }

            if (picked.action === 'refresh') {
                try {
                    const models = await ollamaClient.listModels();
                    availableModels = models.map(m => m.name);
                    chatProvider.updateAvailableModels(availableModels);
                    vscode.window.showInformationMessage(`已刷新，共 ${availableModels.length} 个模型`);
                } catch (e) {
                    vscode.window.showErrorMessage('获取模型列表失败');
                }
                return;
            }

            // Fetch latest model list
            try {
                const models = await ollamaClient.listModels();
                availableModels = models.map(m => m.name);
            } catch (e) {}

            const modelItems = [...availableModels.map(name => ({ label: name })), { label: '$(edit) 手动输入模型名...' }];
            const selected = await vscode.window.showQuickPick(modelItems, {
                placeHolder: `选择${picked.action === 'textModel' ? '文本' : '视觉'}模型`
            });
            if (!selected) { return; }

            let modelName = selected.label;
            if (modelName === '$(edit) 手动输入模型名...') {
                const input = await vscode.window.showInputBox({ prompt: '输入模型名称' });
                if (!input) { return; }
                modelName = input;
            }

            if (picked.action === 'textModel') {
                await cfg.update('model', modelName, vscode.ConfigurationTarget.Global);
                chatProvider.switchModel(modelName);
                vscode.window.showInformationMessage(`文本模型已设为: ${modelName}`);
            } else {
                await cfg.update('visionModel', modelName, vscode.ConfigurationTarget.Global);
                chatProvider.switchVisionModel(modelName);
                vscode.window.showInformationMessage(`视觉模型已设为: ${modelName}`);
            }
        })
    );

    // Listen for config changes — keep Webview in sync immediately
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('ollamaAgent.model')) {
                const newModel = vscode.workspace.getConfiguration('ollamaAgent').get<string>('model', 'qwen3-coder:30b');
                chatProvider.switchModel(newModel);
            }
            if (e.affectsConfiguration('ollamaAgent.visionModel')) {
                const newVision = vscode.workspace.getConfiguration('ollamaAgent').get<string>('visionModel', '');
                chatProvider.switchVisionModel(newVision);
            }
        })
    );
}

export function deactivate() {}
