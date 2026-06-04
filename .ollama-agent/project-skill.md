# Project Structure

## Root Files
- .gitignore
- build.ps1
- DEVELOPMENT.md
- ollama-agent-1.9.2.vsix
- package-lock.json
- package.json
- tsconfig.json

## Directory Structure
```
📁 .vscode/
  📄 launch.json
  📄 settings.json
  📄 tasks.json
📁 resources/
  📄 icon.svg
📁 src/
  📁 tools/
    📄 codebaseTools.ts
    📄 fileTools.ts
    📄 terminalTools.ts
  📁 utils/
    📄 imageUtils.ts
  📄 chatPanel.ts
  📄 chatViewProvider.ts
  📄 chatViewProvider.ts.bak
  📄 chatViewProvider.ts.orig
  📄 extension.ts
  📄 ollamaClient.ts
📄 build.ps1
📄 DEVELOPMENT.md
📄 ollama-agent-1.9.2.vsix
📄 package-lock.json
📄 package.json
📄 tsconfig.json
```

## Project Type
Node.js / TypeScript, TypeScript

## Entry Points
- src/extension.ts (VS Code Extension)
