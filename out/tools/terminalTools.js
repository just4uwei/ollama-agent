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
exports.TerminalTools = void 0;
const vscode = __importStar(require("vscode"));
class TerminalTools {
    async executeCommand(command) {
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
    async executeAndCapture(command, cwd) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const workingDir = cwd || workspaceFolder?.uri.fsPath;
        return new Promise((resolve, reject) => {
            const cp = require('child_process');
            const shell = process.platform === 'win32' ? true : '/bin/bash';
            cp.exec(command, {
                cwd: workingDir,
                maxBuffer: 1024 * 1024 * 10, // 10MB buffer
                shell: shell
            }, (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`Command failed: ${error.message}\n${stderr}`));
                }
                else {
                    resolve(stdout || stderr);
                }
            });
        });
    }
}
exports.TerminalTools = TerminalTools;
//# sourceMappingURL=terminalTools.js.map