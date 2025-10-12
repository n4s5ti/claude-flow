import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Logger } from '../core/logger.js';
import { generateId } from '../utils/helpers.js';
import { ClaudeFlowSDKAdapter } from '../sdk/sdk-config.js';
import { ClaudeClientV25 } from '../api/claude-client-v2.5.js';
export class TaskExecutorSDK extends EventEmitter {
    logger;
    claudeClient;
    sdkAdapter;
    config;
    executionStats = new Map();
    constructor(config = {}){
        super();
        this.config = {
            apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
            maxRetries: config.maxRetries || 3,
            timeout: config.timeout || 60000,
            swarmMode: config.swarmMode !== false,
            checkpointInterval: config.checkpointInterval || 30000
        };
        this.logger = new Logger('TaskExecutorSDK');
        this.sdkAdapter = new ClaudeFlowSDKAdapter({
            apiKey: this.config.apiKey,
            maxRetries: this.config.maxRetries,
            timeout: this.config.timeout,
            swarmMode: this.config.swarmMode,
            checkpointInterval: this.config.checkpointInterval
        });
        this.claudeClient = new ClaudeClientV25({
            apiKey: this.config.apiKey,
            retryAttempts: this.config.maxRetries,
            timeout: this.config.timeout,
            enableSwarmMode: this.config.swarmMode
        }, this.logger);
        this.logger.info('Task Executor SDK initialized', {
            swarmMode: this.config.swarmMode,
            maxRetries: this.config.maxRetries
        });
    }
    async executeTask(task, agent) {
        const executionId = generateId('exec');
        const startTime = Date.now();
        this.logger.info(`Executing task ${task.id} with agent ${agent.id}`, {
            taskType: task.type,
            agentType: agent.type
        });
        try {
            this.emit('task:start', {
                executionId,
                taskId: task.id,
                agentId: agent.id
            });
            const prompt = this.buildPrompt(task, agent);
            const response = await this.claudeClient.makeRequest({
                model: 'claude-3-sonnet-20240229',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                system: this.getSystemPrompt(agent),
                max_tokens: 4000,
                temperature: 0.7
            });
            const output = this.processResponse(response);
            const executionTime = Date.now() - startTime;
            const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
            this.executionStats.set(executionId, {
                taskId: task.id,
                agentId: agent.id,
                executionTime,
                tokensUsed,
                timestamp: Date.now()
            });
            this.emit('task:complete', {
                executionId,
                taskId: task.id,
                agentId: agent.id,
                result: output
            });
            return {
                success: true,
                output,
                errors: [],
                executionTime,
                tokensUsed,
                retryCount: 0
            };
        } catch (error) {
            const executionTime = Date.now() - startTime;
            this.logger.error(`Task execution failed for ${task.id}`, {
                error: error instanceof Error ? error.message : 'Unknown error',
                taskId: task.id,
                agentId: agent.id
            });
            this.emit('task:error', {
                executionId,
                taskId: task.id,
                agentId: agent.id,
                error
            });
            return {
                success: false,
                output: null,
                errors: [
                    error instanceof Error ? error.message : 'Unknown error'
                ],
                executionTime,
                tokensUsed: 0
            };
        }
    }
    async executeStreamingTask(task, agent, onChunk) {
        const executionId = generateId('stream-exec');
        const startTime = Date.now();
        this.logger.info(`Executing streaming task ${task.id}`, {
            taskType: task.type,
            agentId: agent.id
        });
        try {
            const prompt = this.buildPrompt(task, agent);
            let fullOutput = '';
            const response = await this.claudeClient.makeStreamingRequest({
                model: 'claude-3-sonnet-20240229',
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                system: this.getSystemPrompt(agent),
                max_tokens: 4000,
                temperature: 0.7,
                stream: true
            }, (chunk)=>{
                if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
                    fullOutput += chunk.delta.text;
                    onChunk?.(chunk.delta.text);
                }
            });
            const executionTime = Date.now() - startTime;
            const tokensUsed = response.usage.input_tokens + response.usage.output_tokens;
            return {
                success: true,
                output: fullOutput,
                errors: [],
                executionTime,
                tokensUsed
            };
        } catch (error) {
            const executionTime = Date.now() - startTime;
            return {
                success: false,
                output: null,
                errors: [
                    error instanceof Error ? error.message : 'Unknown error'
                ],
                executionTime,
                tokensUsed: 0
            };
        }
    }
    async executeClaudeTask(task, agent, options) {
        if (options?.interactive) {
            return this.executeInteractiveCLI(task, agent);
        }
        return this.executeTask(task, agent);
    }
    async executeInteractiveCLI(task, agent) {
        const startTime = Date.now();
        return new Promise((resolve)=>{
            const args = [
                '--no-visual',
                task.description
            ];
            const claudeProcess = spawn('claude', args, {
                stdio: 'pipe',
                env: {
                    ...process.env
                }
            });
            let output = '';
            let errorOutput = '';
            claudeProcess.stdout?.on('data', (data)=>{
                output += data.toString();
            });
            claudeProcess.stderr?.on('data', (data)=>{
                errorOutput += data.toString();
            });
            claudeProcess.on('close', (code)=>{
                const executionTime = Date.now() - startTime;
                resolve({
                    success: code === 0,
                    output: output || errorOutput,
                    errors: code !== 0 ? [
                        errorOutput
                    ] : [],
                    executionTime,
                    tokensUsed: 0
                });
            });
            claudeProcess.on('error', (error)=>{
                const executionTime = Date.now() - startTime;
                resolve({
                    success: false,
                    output: null,
                    errors: [
                        error.message
                    ],
                    executionTime,
                    tokensUsed: 0
                });
            });
        });
    }
    buildPrompt(task, agent) {
        const agentContext = `
You are an AI agent with the following capabilities:
- Type: ${agent.type}
- Capabilities: ${agent.capabilities.join(', ')}
- Status: ${agent.status}
`;
        const taskContext = `
Task: ${task.description}
Type: ${task.type}
Priority: ${task.priority || 'medium'}
${task.dependencies?.length ? `Dependencies: ${task.dependencies.join(', ')}` : ''}
`;
        return `${agentContext}\n\n${taskContext}\n\nPlease complete this task and provide a detailed response.`;
    }
    getSystemPrompt(agent) {
        const prompts = {
            'researcher': 'You are a research specialist. Analyze information thoroughly and provide comprehensive insights.',
            'coder': 'You are a coding expert. Write clean, efficient, and well-documented code.',
            'analyst': 'You are a data analyst. Analyze patterns, metrics, and provide actionable insights.',
            'optimizer': 'You are an optimization specialist. Identify inefficiencies and suggest improvements.',
            'coordinator': 'You are a coordination expert. Organize tasks, manage dependencies, and ensure smooth execution.'
        };
        return prompts[agent.type] || 'You are a helpful AI assistant. Complete tasks accurately and efficiently.';
    }
    processResponse(response) {
        if (!response.content || response.content.length === 0) {
            return null;
        }
        const textContent = response.content.filter((block)=>block.type === 'text').map((block)=>block.text).join('\n');
        return {
            text: textContent,
            model: response.model,
            tokensUsed: response.usage,
            stopReason: response.stop_reason
        };
    }
    getExecutionStats() {
        return new Map(this.executionStats);
    }
    clearExecutionStats() {
        this.executionStats.clear();
    }
    async getHealthStatus() {
        const health = await this.claudeClient.checkHealth();
        return {
            ...health,
            executorStats: {
                totalExecutions: this.executionStats.size,
                swarmMode: this.config.swarmMode
            }
        };
    }
}
export { TaskExecutorSDK as TaskExecutor };

//# sourceMappingURL=executor-sdk.js.map