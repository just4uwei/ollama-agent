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
exports.CodebaseIndexer = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class CodebaseIndexer {
    constructor(client, embeddingModel = 'nomic-embed-text') {
        this.index = new Map();
        this._isIndexing = false;
        this._workspacePath = '';
        this.client = client;
        this.embeddingModel = embeddingModel;
    }
    get isIndexing() {
        return this._isIndexing;
    }
    get indexedFileCount() {
        return this.index.size;
    }
    /**
     * Start automatic indexing: index on open, watch for changes.
     * Call this once during extension activation.
     */
    startAutoIndex(context) {
        // Create status bar item
        this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this._statusBarItem.command = 'ollamaAgent.indexProject';
        context.subscriptions.push(this._statusBarItem);
        // Index current workspace if open
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this._workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
            // Auto-index on startup (delayed slightly to not slow down VS Code startup)
            setTimeout(() => {
                this._autoIndex();
            }, 3000);
        }
        // Watch for workspace folder changes
        context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
            if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                this._workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
                this._autoIndex();
            }
        }));
        // Watch file system changes for incremental re-index
        if (vscode.workspace.workspaceFolders) {
            this._setupFileWatcher(context);
        }
        // Also re-setup watcher when workspace folders change
        context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
            this._setupFileWatcher(context);
        }));
    }
    _setupFileWatcher(context) {
        // Dispose old watcher
        if (this._fileWatcher) {
            this._fileWatcher.dispose();
        }
        // Watch all code files
        const pattern = new vscode.RelativePattern(vscode.workspace.workspaceFolders[0], '**/*.{ts,tsx,js,jsx,py,java,go,rs,c,cpp,h,hpp,cs,rb,php,vue,html,css,scss,json,yaml,yml,md}');
        this._fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
        this._fileWatcher.onDidCreate((uri) => {
            this._debouncedReindexFile(uri.fsPath, 'created');
        });
        this._fileWatcher.onDidChange((uri) => {
            this._debouncedReindexFile(uri.fsPath, 'changed');
        });
        this._fileWatcher.onDidDelete((uri) => {
            this.index.delete(uri.fsPath);
        });
        context.subscriptions.push(this._fileWatcher);
    }
    /**
     * Debounce file changes — wait 2s after the last change before re-indexing a file.
     * This prevents re-indexing on every save during rapid editing.
     */
    _debouncedReindexFile(filePath, reason) {
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
        }
        this._debounceTimer = setTimeout(() => {
            this._reindexFile(filePath);
        }, 2000);
    }
    /**
     * Re-index a single file (incremental update).
     */
    async _reindexFile(filePath) {
        if (this._isIndexing) {
            return;
        }
        try {
            const chunks = await this.chunkFile(filePath);
            const config = vscode.workspace.getConfiguration('ollamaAgent');
            const embeddingModel = config.get('embeddingModel', this.embeddingModel);
            const chunkWithPath = chunks.map(chunk => ({
                ...chunk,
                filePath: path.relative(this._workspacePath, filePath)
            }));
            for (const chunk of chunkWithPath) {
                try {
                    chunk.embedding = await this.client.embed(embeddingModel, chunk.content);
                }
                catch (e) {
                    console.error(`Failed to embed chunk from ${chunk.filePath}:`, e);
                }
            }
            this.index.set(filePath, chunkWithPath);
            this._updateStatusBar();
        }
        catch (e) {
            // File might be deleted or unreadable, just skip
        }
    }
    /**
     * Auto-index with status updates.
     */
    async _autoIndex() {
        if (this._isIndexing || !this._workspacePath) {
            return;
        }
        this._statusBarItem?.show();
        this._statusBarItem.text = '$(sync~spin) Ollama: 索引中...';
        this._statusBarItem.tooltip = '正在为项目构建代码索引';
        try {
            await this.indexWorkspace(this._workspacePath);
            this._statusBarItem.text = `$(database) Ollama: ${this.index.size} 文件已索引`;
            this._statusBarItem.tooltip = '项目索引完成，点击重新索引';
        }
        catch (e) {
            this._statusBarItem.text = '$(error) Ollama: 索引失败';
            this._statusBarItem.tooltip = `索引失败: ${e}`;
        }
    }
    _updateStatusBar() {
        if (this._statusBarItem) {
            this._statusBarItem.text = `$(database) Ollama: ${this.index.size} 文件已索引`;
            this._statusBarItem.tooltip = '项目索引完成，点击重新索引';
        }
    }
    async indexWorkspace(workspacePath) {
        this._isIndexing = true;
        const files = await this.getCodeFiles(workspacePath);
        const config = vscode.workspace.getConfiguration('ollamaAgent');
        const embeddingModel = config.get('embeddingModel', this.embeddingModel);
        // Clear existing index
        this.index.clear();
        for (const file of files) {
            const chunks = await this.chunkFile(file);
            const chunkWithPath = chunks.map(chunk => ({
                ...chunk,
                filePath: path.relative(workspacePath, file)
            }));
            // Get embeddings for each chunk
            for (const chunk of chunkWithPath) {
                try {
                    chunk.embedding = await this.client.embed(embeddingModel, chunk.content);
                }
                catch (e) {
                    console.error(`Failed to embed chunk from ${chunk.filePath}:`, e);
                }
            }
            this.index.set(file, chunkWithPath);
        }
        this._isIndexing = false;
    }
    async search(query, topK = 5) {
        if (this.index.size === 0) {
            return '';
        }
        const config = vscode.workspace.getConfiguration('ollamaAgent');
        const embeddingModel = config.get('embeddingModel', this.embeddingModel);
        // Get query embedding
        const queryEmbedding = await this.client.embed(embeddingModel, query);
        // Search all chunks
        const allChunks = [];
        for (const chunks of this.index.values()) {
            allChunks.push(...chunks);
        }
        // Calculate similarities
        const similarities = allChunks
            .filter(chunk => chunk.embedding)
            .map(chunk => ({
            chunk,
            similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding)
        }))
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);
        // Format results
        return similarities
            .map(s => `[${s.chunk.filePath}:${s.chunk.startLine}-${s.chunk.endLine}]\n${s.chunk.content}`)
            .join('\n\n---\n\n');
    }
    async getCodeFiles(dir) {
        const files = [];
        const extensions = [
            '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs',
            '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.vue',
            '.html', '.css', '.scss', '.json', '.yaml', '.yml', '.md'
        ];
        const ignoreDirs = ['node_modules', '.git', 'dist', 'build', 'out', '.venv', '__pycache__'];
        const walk = (currentDir) => {
            let entries;
            try {
                entries = fs.readdirSync(currentDir, { withFileTypes: true });
            }
            catch {
                return; // Permission denied or similar
            }
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    if (!ignoreDirs.includes(entry.name)) {
                        walk(fullPath);
                    }
                }
                else if (entry.isFile()) {
                    const ext = path.extname(entry.name);
                    if (extensions.includes(ext)) {
                        files.push(fullPath);
                    }
                }
            }
        };
        walk(dir);
        return files;
    }
    async chunkFile(filePath, maxLines = 100) {
        let content;
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        }
        catch {
            return [];
        }
        const lines = content.split('\n');
        const chunks = [];
        // Simple chunking by line count
        for (let i = 0; i < lines.length; i += maxLines) {
            const chunkLines = lines.slice(i, Math.min(i + maxLines, lines.length));
            chunks.push({
                filePath: '',
                content: chunkLines.join('\n'),
                startLine: i + 1,
                endLine: Math.min(i + maxLines, lines.length)
            });
        }
        return chunks;
    }
    /**
     * Analyze project structure and generate a skill description.
     * Returns markdown content suitable for project-skill.md.
     */
    analyzeProjectStructure(workspacePath) {
        const lines = [];
        lines.push('# Project Structure');
        lines.push('');
        // Root files (package.json, Cargo.toml, go.mod, etc.)
        const rootFiles = fs.readdirSync(workspacePath).filter(f => fs.statSync(path.join(workspacePath, f)).isFile());
        if (rootFiles.length > 0) {
            lines.push('## Root Files');
            rootFiles.forEach(f => lines.push(`- ${f}`));
            lines.push('');
        }
        // Directory tree (depth-limited)
        const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.venv', '__pycache__', '.svn', 'target', 'bin', 'obj', '.next', '.nuxt', 'coverage']);
        const maxDepth = 3;
        lines.push('## Directory Structure');
        lines.push('```');
        this._walkTree(workspacePath, workspacePath, lines, ignoreDirs, 0, maxDepth);
        lines.push('```');
        lines.push('');
        // Detect project type
        lines.push('## Project Type');
        const types = [];
        if (fs.existsSync(path.join(workspacePath, 'package.json'))) {
            types.push('Node.js / TypeScript');
        }
        if (fs.existsSync(path.join(workspacePath, 'tsconfig.json'))) {
            types.push('TypeScript');
        }
        if (fs.existsSync(path.join(workspacePath, 'Cargo.toml'))) {
            types.push('Rust');
        }
        if (fs.existsSync(path.join(workspacePath, 'go.mod'))) {
            types.push('Go');
        }
        if (fs.existsSync(path.join(workspacePath, 'pyproject.toml')) || fs.existsSync(path.join(workspacePath, 'requirements.txt'))) {
            types.push('Python');
        }
        if (fs.existsSync(path.join(workspacePath, 'pom.xml')) || fs.existsSync(path.join(workspacePath, 'build.gradle'))) {
            types.push('Java');
        }
        if (fs.existsSync(path.join(workspacePath, 'CMakeLists.txt'))) {
            types.push('C/C++');
        }
        if (fs.existsSync(path.join(workspacePath, '.csproj'))) {
            types.push('C#');
        }
        lines.push(types.length > 0 ? types.join(', ') : 'Unknown');
        lines.push('');
        // Entry points detection
        lines.push('## Entry Points');
        const entries = [];
        if (fs.existsSync(path.join(workspacePath, 'src', 'index.ts'))) {
            entries.push('src/index.ts');
        }
        if (fs.existsSync(path.join(workspacePath, 'src', 'main.ts'))) {
            entries.push('src/main.ts');
        }
        if (fs.existsSync(path.join(workspacePath, 'src', 'app.ts'))) {
            entries.push('src/app.ts');
        }
        if (fs.existsSync(path.join(workspacePath, 'src', 'main.py'))) {
            entries.push('src/main.py');
        }
        if (fs.existsSync(path.join(workspacePath, 'main.go'))) {
            entries.push('main.go');
        }
        if (fs.existsSync(path.join(workspacePath, 'src', 'main.rs'))) {
            entries.push('src/main.rs');
        }
        if (fs.existsSync(path.join(workspacePath, 'src', 'lib.rs'))) {
            entries.push('src/lib.rs');
        }
        if (fs.existsSync(path.join(workspacePath, 'src', 'extension.ts'))) {
            entries.push('src/extension.ts (VS Code Extension)');
        }
        if (entries.length === 0) {
            entries.push('(auto-detect failed, check root files)');
        }
        entries.forEach(e => lines.push(`- ${e}`));
        lines.push('');
        return lines.join('\n');
    }
    _walkTree(basePath, currentPath, lines, ignoreDirs, depth, maxDepth) {
        if (depth > maxDepth) {
            return;
        }
        let entries;
        try {
            entries = fs.readdirSync(currentPath, { withFileTypes: true });
        }
        catch {
            return;
        }
        // Sort: directories first, then files
        entries.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory())
                return -1;
            if (!a.isDirectory() && b.isDirectory())
                return 1;
            return a.name.localeCompare(b.name);
        });
        const prefix = '  '.repeat(depth);
        for (const entry of entries) {
            if (ignoreDirs.has(entry.name) || entry.name.startsWith('.') && entry.name !== '.vscode') {
                continue;
            }
            const rel = path.relative(basePath, path.join(currentPath, entry.name));
            if (entry.isDirectory()) {
                lines.push(`${prefix}📁 ${entry.name}/`);
                this._walkTree(basePath, path.join(currentPath, entry.name), lines, ignoreDirs, depth + 1, maxDepth);
            }
            else {
                lines.push(`${prefix}📄 ${entry.name}`);
            }
        }
    }
    cosineSimilarity(a, b) {
        if (a.length !== b.length) {
            return 0;
        }
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
exports.CodebaseIndexer = CodebaseIndexer;
//# sourceMappingURL=codebaseTools.js.map