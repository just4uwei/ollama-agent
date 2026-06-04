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
exports.ImageTools = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const https = __importStar(require("https"));
const http = __importStar(require("http"));
const fs = __importStar(require("fs"));
class ImageTools {
    /**
     * Generate image via Pollinations.ai free API.
     * Falls back to SVG generation if API fails.
     * Saves to workspace/outputs/ directory.
     */
    async generateImage(options) {
        const { prompt, width = 1024, height = 1024 } = options;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        // Try Pollinations.ai API first
        const apiResult = await this._generateViaApi(prompt, width, height);
        if (apiResult.success && apiResult.imagePath) {
            return apiResult;
        }
        // Fallback to SVG
        return this._generateSvg(prompt, workspaceFolder?.uri.fsPath);
    }
    async _generateViaApi(prompt, width, height) {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                return { success: false, error: 'No workspace folder', method: 'api' };
            }
            const encodedPrompt = encodeURIComponent(prompt);
            const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${Math.floor(Math.random() * 999999)}`;
            const outputDir = path.join(workspaceFolder.uri.fsPath, '.ollama-agent', 'outputs');
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            const filename = `img_${Date.now()}.png`;
            const outputPath = path.join(outputDir, filename);
            await this._downloadFile(url, outputPath);
            // Verify file size
            const stats = fs.statSync(outputPath);
            if (stats.size < 1000) {
                fs.unlinkSync(outputPath);
                return { success: false, error: 'Image too small, likely empty response', method: 'api' };
            }
            return { success: true, imagePath: outputPath, method: 'api' };
        }
        catch (e) {
            return { success: false, error: e.message, method: 'api' };
        }
    }
    async _downloadFile(url, outputPath) {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https') ? https : http;
            const req = client.get(url, { timeout: 60000 }, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                const writeStream = fs.createWriteStream(outputPath);
                res.pipe(writeStream);
                writeStream.on('finish', () => resolve());
                writeStream.on('error', reject);
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
        });
    }
    async _generateSvg(prompt, workspacePath) {
        try {
            const dir = workspacePath
                ? path.join(workspacePath, '.ollama-agent', 'outputs')
                : path.join(__dirname, '..', '..', '.ollama-agent', 'outputs');
            if (workspacePath && !fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const filename = `img_${Date.now()}.svg`;
            const svgPath = workspacePath ? path.join(dir, filename) : path.join(dir, filename);
            // Generate artistic SVG based on prompt
            const colors = this._extractColors(prompt);
            const svg = this._generateArtisticSvg(prompt, colors);
            if (workspacePath) {
                fs.writeFileSync(svgPath, svg, 'utf-8');
            }
            return {
                success: true,
                imagePath: workspacePath ? svgPath : undefined,
                error: workspacePath ? undefined : 'No workspace',
                method: 'svg'
            };
        }
        catch (e) {
            return { success: false, error: e.message, method: 'svg' };
        }
    }
    _extractColors(prompt) {
        const colorMap = {
            'red': '#e74c3c', 'blue': '#3498db', 'green': '#2ecc71',
            'yellow': '#f1c40f', 'orange': '#e67e22', 'purple': '#9b59b6',
            'pink': '#fd79a8', 'cyan': '#00cec9', 'black': '#2d3436',
            'white': '#dfe6e9', 'golden': '#fdcb6e', 'silver': '#b2bec3',
            'sunset': '#e17055', 'ocean': '#0984e3', 'forest': '#00b894',
            'night': '#2d3436', 'aurora': '#a29bfe'
        };
        const lower = prompt.toLowerCase();
        const found = ['#636e72', '#b2bec3']; // default gray tones
        for (const [key, color] of Object.entries(colorMap)) {
            if (lower.includes(key)) {
                found.push(color);
            }
        }
        return found.slice(0, 4);
    }
    _generateArtisticSvg(prompt, colors) {
        const w = 800, h = 800;
        const [c1, c2, c3] = colors.length >= 3 ? [colors[0], colors[1], colors[2]] : ['#636e72', '#b2bec3', '#dfe6e9'];
        const shapes = this._generateAbstractShapes(prompt, colors);
        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${c1};stop-opacity:1"/>
      <stop offset="100%" style="stop-color:${c2};stop-opacity:1"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  ${shapes}
  <text x="${w / 2}" y="${h - 30}" text-anchor="middle" font-family="sans-serif" font-size="14" fill="rgba(255,255,255,0.4)">${this._escapeXml(prompt.slice(0, 80))}</text>
</svg>`;
    }
    _generateAbstractShapes(prompt, colors) {
        const seed = prompt.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const rand = (n) => ((seed * 9301 + 49297) % 233280) / 233280 * n;
        const shapes = [];
        const [c1, c2, c3] = colors;
        // Circles
        for (let i = 0; i < 8; i++) {
            const cx = rand(800), cy = rand(800), r = rand(200) + 30;
            const opacity = (rand(60) + 20) / 100;
            const color = i % 3 === 0 ? c1 : i % 3 === 1 ? c2 : c3;
            shapes.push(`<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${color}" opacity="${opacity.toFixed(2)}" filter="url(#glow)"/>`);
        }
        // Rectangles
        for (let i = 0; i < 5; i++) {
            const x = rand(800), y = rand(800);
            const w = rand(300) + 50, h = rand(200) + 30;
            const opacity = (rand(40) + 10) / 100;
            const color = i % 2 === 0 ? c2 : c3;
            shapes.push(`<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="${color}" opacity="${opacity.toFixed(2)}" rx="8"/>`);
        }
        // Lines
        for (let i = 0; i < 12; i++) {
            const x1 = rand(800), y1 = rand(800);
            const x2 = rand(800), y2 = rand(800);
            const opacity = (rand(50) + 10) / 100;
            shapes.push(`<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="rgba(255,255,255,${opacity.toFixed(2)})" stroke-width="${(rand(3) + 0.5).toFixed(1)}"/>`);
        }
        return shapes.join('\n  ');
    }
    _escapeXml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}
exports.ImageTools = ImageTools;
//# sourceMappingURL=imageTools.js.map