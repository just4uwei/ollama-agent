import * as http from 'http';

export interface OllamaResponse {
    model: string;
    created_at: string;
    message: {
        role: string;
        content: string;
    };
    done: boolean;
}

export interface OllamaModel {
    name: string;
    size: number;
}

export interface ChatProgress {
    /** 0-100 percentage of generation */
    percent: number;
    /** tokens generated so far */
    tokensGenerated: number;
    /** total tokens predicted (context + response budget) */
    tokensTotal: number;
}

export type ProgressCallback = (progress: ChatProgress) => void;

export class OllamaClient {
    private apiBase: string;

    constructor(apiBase: string) {
        this.apiBase = apiBase;
    }

    async chat(
        model: string,
        messages: Array<{ role: string; content: string; images?: string[] }>,
        onStream?: (chunk: string) => void,
        onProgress?: ProgressCallback
    ): Promise<string> {
        const url = new URL(`${this.apiBase}/api/chat`);
        const body = JSON.stringify({
            model,
            messages,
            stream: !!onStream
        });

        if (onStream) {
            return new Promise((resolve, reject) => {
                const req = http.request(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 300000
                }, (res) => {
                    if (res.statusCode !== 200) {
                        let errData = '';
                        res.on('data', (d: Buffer) => errData += d.toString());
                        res.on('end', () => reject(new Error(`Ollama API error: ${res.statusCode} ${errData}`)));
                        return;
                    }

                    let fullContent = '';
                    let buffer = '';

                    res.on('data', (chunk: Buffer) => {
                        buffer += chunk.toString();
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            if (!line.trim()) { continue; }
                            try {
                                const data = JSON.parse(line);
                                if (data.message?.content) {
                                    fullContent += data.message.content;
                                    onStream!(data.message.content);
                                }
                                // Progress reporting
                                if (onProgress) {
                                    this._reportProgress(data, onProgress);
                                }
                            } catch (e) {
                                // Skip invalid JSON lines
                            }
                        }
                    });

                    res.on('end', () => {
                        if (buffer.trim()) {
                            try {
                                const data = JSON.parse(buffer);
                                if (data.message?.content) {
                                    fullContent += data.message.content;
                                    onStream!(data.message.content);
                                }
                                // Final progress = 100%
                                if (onProgress) {
                                    onProgress({ percent: 100, tokensGenerated: data.eval_count || 0, tokensTotal: data.eval_count || 0 });
                                }
                            } catch (e) {}
                        }
                        resolve(fullContent);
                    });

                    res.on('error', reject);
                });

                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Ollama API request timed out'));
                });
                req.write(body);
                req.end();
            });
        } else {
            return new Promise((resolve, reject) => {
                const req = http.request(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 300000
                }, (res) => {
                    if (res.statusCode !== 200) {
                        let errData = '';
                        res.on('data', (d: Buffer) => errData += d.toString());
                        res.on('end', () => reject(new Error(`Ollama API error: ${res.statusCode} ${errData}`)));
                        return;
                    }

                    let fullContent = '';
                    let buffer = '';

                    res.on('data', (chunk: Buffer) => {
                        buffer += chunk.toString();
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            if (!line.trim()) { continue; }
                            try {
                                const data = JSON.parse(line);
                                if (data.message?.content) {
                                    fullContent += data.message.content;
                                }
                            } catch (e) {}
                        }
                    });

                    res.on('end', () => {
                        if (buffer.trim()) {
                            try {
                                const data = JSON.parse(buffer);
                                if (data.message?.content) {
                                    fullContent += data.message.content;
                                }
                            } catch (e) {}
                        }
                        resolve(fullContent);
                    });

                    res.on('error', reject);
                });

                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Ollama API request timed out'));
                });
                req.write(body);
                req.end();
            });
        }
    }

    /**
     * Extract progress from a streamed Ollama response line.
     *
     * Ollama /api/chat stream sends these fields per line:
     *   - prompt_eval_count:  tokens in the prompt (context)
     *   - eval_count:         tokens generated so far (cumulative in final line)
     *   - eval_total_tokens   OR  prompt_eval_count + eval_count as total
     *   - done: true on the last line (contains final counts)
     *
     * Before the first token, we can estimate from prompt_eval_count.
     * During generation, we track eval_count vs a running total estimate.
     */
    private _reportProgress(data: any, onProgress: ProgressCallback): void {
        if (!data) { return; }

        // Only report on lines that have token counts
        const evalCount = data.eval_count || 0;
        const promptEvalCount = data.prompt_eval_count || 0;
        const evalTotalTokens = data.eval_total_tokens || 0;

        if (evalCount === 0 && promptEvalCount === 0) { return; }

        let percent = 0;
        let tokensGenerated = evalCount;
        let tokensTotal = 0;

        if (data.done) {
            // Final line — we're done
            percent = 100;
            tokensTotal = evalCount;
        } else if (evalTotalTokens > 0) {
            // Some Ollama versions send eval_total_tokens per line
            tokensTotal = evalTotalTokens;
            percent = tokensTotal > 0 ? Math.min(99, Math.round((evalCount / tokensTotal) * 100)) : 0;
        } else if (promptEvalCount > 0 && evalCount > 0) {
            // Estimate: typical response length ~ prompt length * 0.5, minimum 128
            const estimatedResponse = Math.max(promptEvalCount, 128);
            tokensTotal = promptEvalCount + estimatedResponse;
            percent = tokensTotal > 0 ? Math.min(99, Math.round(((promptEvalCount + evalCount) / tokensTotal) * 100)) : 0;
        } else if (evalCount > 0) {
            // Only eval_count available — rough estimate: assume ~512 token response
            tokensTotal = 512;
            percent = Math.min(99, Math.round((evalCount / tokensTotal) * 100));
        }

        if (percent > 0) {
            onProgress({ percent, tokensGenerated, tokensTotal });
        }
    }

    async embed(model: string, text: string): Promise<number[]> {
        const url = new URL(`${this.apiBase}/api/embeddings`);
        const body = JSON.stringify({ model, prompt: text });

        return new Promise((resolve, reject) => {
            const req = http.request(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                timeout: 60000
            }, (res) => {
                if (res.statusCode !== 200) {
                    let errData = '';
                    res.on('data', (d: Buffer) => errData += d.toString());
                    res.on('end', () => reject(new Error(`Ollama API error: ${res.statusCode} ${errData}`)));
                    return;
                }

                let data = '';
                res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed.embedding || []);
                    } catch (e) {
                        reject(new Error('Failed to parse embedding response'));
                    }
                });
                res.on('error', reject);
            });

            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }

    async listModels(): Promise<OllamaModel[]> {
        const url = new URL(`${this.apiBase}/api/tags`);

        return new Promise((resolve, reject) => {
            const req = http.request(url, {
                method: 'GET',
                timeout: 10000
            }, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Ollama API error: ${res.statusCode}`));
                    return;
                }

                let data = '';
                res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed.models || []);
                    } catch (e) {
                        reject(new Error('Failed to parse models response'));
                    }
                });
                res.on('error', reject);
            });

            req.on('error', reject);
            req.end();
        });
    }
}
