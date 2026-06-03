import * as vscode from 'vscode';

export class TerminalTools {
    private terminal: vscode.Terminal | undefined;

    async executeCommand(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            // Create terminal if not exists
            if (!this.terminal || this.terminal.exitStatus !== undefined) {
                this.terminal = vscode.window.createTerminal('Ollama Agent');
            }

            this.terminal.show();

            // Execute command
            this.terminal.sendText(command);

            // Note: We can't capture terminal output directly in VS Code
            // This is a limitation of the VS Code API
            // For now, we'll just return a success message
            resolve('命令已在终端执行，请查看终端输出');

            // Alternative: Use shell execution for capturing output
            // But this won't show in the visible terminal
        });
    }

    async executeAndCapture(command: string, cwd?: string): Promise<string> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const workingDir = cwd || workspaceFolder?.uri.fsPath;

        return new Promise((resolve, reject) => {
            const cp = require('child_process');
            const shell = process.platform === 'win32' ? true : '/bin/bash';

            cp.exec(
                command,
                {
                    cwd: workingDir,
                    maxBuffer: 1024 * 1024 * 10, // 10MB buffer
                    shell: shell
                },
                (error: Error | null, stdout: string, stderr: string) => {
                    if (error) {
                        reject(new Error(`Command failed: ${error.message}\n${stderr}`));
                    } else {
                        resolve(stdout || stderr);
                    }
                }
            );
        });
    }
}
