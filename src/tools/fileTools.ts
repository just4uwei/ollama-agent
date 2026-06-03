import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class FileTools {
    async createFile(relativePath: string, content: string): Promise<void> {
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
    }

    async editFile(relativePath: string, newContent: string): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }

        const filePath = path.join(workspaceFolder.uri.fsPath, relativePath);

        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${relativePath}`);
        }

        fs.writeFileSync(filePath, newContent, 'utf-8');

        // Show file
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document);
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
