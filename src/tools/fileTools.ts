import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class FileTools {
    private _calculateLineDiff(oldText: string, newText: string) {
        const oldLines = oldText.split(/\r?\n/);
        const newLines = newText.split(/\r?\n/);
        const m = oldLines.length;
        const n = newLines.length;
        const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

        for (let i = m - 1; i >= 0; i--) {
            for (let j = n - 1; j >= 0; j--) {
                if (oldLines[i] === newLines[j]) {
                    dp[i][j] = dp[i + 1][j + 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
                }
            }
        }

        const lcs = dp[0][0];
        return {
            addedLines: Math.max(0, n - lcs),
            removedLines: Math.max(0, m - lcs)
        };
    }

    async createFile(relativePath: string, content: string): Promise<{ addedLines: number; removedLines: number; path: string }> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }

        const filePath = path.join(workspaceFolder.uri.fsPath, relativePath);
        const dir = path.dirname(filePath);

        // Create directory if it doesn't exist
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Write file
        fs.writeFileSync(filePath, content, 'utf-8');

        // Open file in editor
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document);

        return {
            addedLines: content.split(/\r?\n/).length,
            removedLines: 0,
            path: relativePath
        };
    }

    async editFile(relativePath: string, newContent: string): Promise<{ addedLines: number; removedLines: number; path: string }> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }

        const filePath = path.join(workspaceFolder.uri.fsPath, relativePath);

        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${relativePath}`);
        }

        const oldContent = fs.readFileSync(filePath, 'utf-8');
        const diff = this._calculateLineDiff(oldContent, newContent);

        fs.writeFileSync(filePath, newContent, 'utf-8');

        // Show file
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document);

        return {
            addedLines: diff.addedLines,
            removedLines: diff.removedLines,
            path: relativePath
        };
    }

    async readFile(relativePath: string): Promise<string> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }

        const filePath = path.join(workspaceFolder.uri.fsPath, relativePath);

        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${relativePath}`);
        }

        return fs.readFileSync(filePath, 'utf-8');
    }

    async deleteFile(relativePath: string): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }

        const filePath = path.join(workspaceFolder.uri.fsPath, relativePath);

        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${relativePath}`);
        }

        // Move to trash instead of deleting
        await vscode.workspace.fs.delete(vscode.Uri.file(filePath));
    }
}
