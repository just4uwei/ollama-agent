# Ollama Agent VS Code 扩展开发完成

## 项目结构

```
ollama-agent/
├── src/
│   ├── extension.ts              # 入口，注册命令和视图
│   ├── chatViewProvider.ts       # Webview 聊天面板（支持图片）
│   ├── ollamaClient.ts           # Ollama API 封装
│   ├── tools/
│   │   ├── fileTools.ts          # 文件操作（创建/编辑/删除）
│   │   ├── terminalTools.ts      # 终端命令执行
│   │   └── codebaseTools.ts      # 项目索引与语义搜索
│   └── utils/
│       └── imageUtils.ts         # 图片处理（Base64）
├── resources/
│   └── icon.svg                  # 扩展图标
├── package.json                  # 扩展配置
└── tsconfig.json                 # TypeScript 配置
```

## 核心功能

### 1. 直接对话 + 图片识别
- Webview 聊天界面
- 支持粘贴/上传图片
- 自动转 Base64 发送给 Ollama
- 流式输出响应

### 2. 自动创建/编辑文件
- 模型返回工具调用 JSON
- 自动解析并执行
- 支持创建目录、写入文件

### 3. 执行终端命令
- 支持两种模式：
  - 可见终端（用户看得到执行过程）
  - 后台执行（捕获输出）

### 4. 项目索引（类似 @codebase）
- 扫描代码文件
- 分块 + Embedding
- 语义搜索相关代码

## 调试方法（无需打包）

### 方法一：VS Code 调试模式（推荐）

1. 在 VS Code 中打开 `C:\Users\31266\.qclaw\workspace\ollama-agent`
2. 按 `F5` 启动调试
3. 会打开一个新的 VS Code 窗口（扩展开发宿主）
4. 在新窗口中，侧边栏会出现 "Ollama Agent" 图标

### 方法二：手动编译后安装

```powershell
cd C:\Users\31266\.qclaw\workspace\ollama-agent
npm run compile
code --install-extension $(ls *.vsix | Select-Object -First 1)
```

## 使用方法

### 配置模型
在 VS Code 设置中搜索 "Ollama Agent"：
- `ollamaAgent.model`: 主模型（默认 `qwen3-coder:30b`）
- `ollamaAgent.apiBase`: Ollama API 地址（默认 `http://localhost:11434`）
- `ollamaAgent.embeddingModel`: 索引用 embedding 模型（默认 `nomic-embed-text`）

### 基本使用
1. 点击侧边栏 Ollama Agent 图标
2. 输入问题或任务
3. 如果需要图片，点击 📎 按钮

### Agent 工具调用格式
告诉模型你的意图，它会自动生成工具调用：

```
创建一个 React 组件，路径 src/components/Button.tsx
```

模型会返回：
```json
{
  "tool": "create_file",
  "path": "src/components/Button.tsx",
  "content": "// React 代码..."
}
```

扩展会自动执行并创建文件。

### 项目索引
1. 打开一个项目文件夹
2. 点击聊天面板顶部的 "索引项目" 按钮
3. 等待索引完成（首次可能需要几分钟）
4. 之后问问题会自动搜索相关代码

## 技术细节

### Ollama API 调用
```typescript
// 对话（带图片）
await client.chat(model, [
  { role: 'user', content: '描述这张图片', images: [base64] }
], onStream);

// Embedding（项目索引）
const embedding = await client.embed('nomic-embed-text', code);
```

### 工具调用解析
```typescript
// 模型输出包含工具调用
const toolRegex = /```tool\n([\s\S]*?)```/g;
// 解析 JSON 并执行
const toolCall = JSON.parse(match[1]);
if (toolCall.tool === 'create_file') {
  await fileTools.createFile(toolCall.path, toolCall.content);
}
```

### 项目索引流程
1. 扫描代码文件（排除 node_modules 等）
2. 按行数分块（每块最多 100 行）
3. 调用 Ollama embedding API 生成向量
4. 存储在内存 Map 中
5. 搜索时计算余弦相似度

## 已知限制

1. **Node 18 兼容性**：部分依赖需要 Node 20+，但扩展在 VS Code 内部运行时使用 VS Code 自带的 Node，所以不影响使用
2. **终端输出捕获**：VS Code API 无法直接捕获可见终端的输出，需要用后台执行模式
3. **项目索引持久化**：当前索引存储在内存中，重启后需要重新索引

## 后续优化方向

- [ ] 索引持久化（SQLite）
- [ ] 支持更多工具（搜索文件、Git 操作）
- [ ] 多轮对话上下文管理
- [ ] 工具调用确认机制
- [ ] 支持 LLaVA 等多模态模型

---

开发完成时间：2026-06-03 16:40
