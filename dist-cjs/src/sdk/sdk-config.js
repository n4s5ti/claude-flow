import Anthropic from '@anthropic-ai/sdk';
export class ClaudeFlowSDKAdapter {
    sdk;
    config;
    swarmMetadata = new Map();
    constructor(config = {}){
        this.config = {
            apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
            baseURL: config.baseURL,
            maxRetries: config.maxRetries || 3,
            timeout: config.timeout || 60000,
            defaultHeaders: config.defaultHeaders || {},
            swarmMode: config.swarmMode !== false,
            persistenceEnabled: config.persistenceEnabled !== false,
            checkpointInterval: config.checkpointInterval || 60000,
            memoryNamespace: config.memoryNamespace || 'claude-flow'
        };
        this.sdk = new Anthropic({
            apiKey: this.config.apiKey,
            baseURL: this.config.baseURL,
            maxRetries: this.config.maxRetries,
            timeout: this.config.timeout,
            defaultHeaders: this.config.defaultHeaders
        });
    }
    getSDK() {
        return this.sdk;
    }
    getConfig() {
        return {
            ...this.config
        };
    }
    async createMessage(params) {
        try {
            const message = await this.sdk.messages.create(params);
            if (this.config.swarmMode && message.id) {
                this.swarmMetadata.set(message.id, {
                    timestamp: Date.now(),
                    model: params.model,
                    tokensUsed: message.usage
                });
            }
            return message;
        } catch (error) {
            if (this.config.swarmMode) {
                console.error('[SDK] Message creation failed in swarm mode:', error);
                this.logSwarmError(error);
            }
            throw error;
        }
    }
    async createStreamingMessage(params, options) {
        const stream = await this.sdk.messages.create({
            ...params,
            stream: true
        });
        let fullMessage = {};
        for await (const chunk of stream){
            if (options?.onChunk) {
                options.onChunk(chunk);
            }
            if (chunk.type === 'message_start') {
                fullMessage = chunk.message;
            } else if (chunk.type === 'content_block_delta') {} else if (chunk.type === 'message_delta') {
                if (chunk.delta?.stop_reason) {
                    fullMessage.stop_reason = chunk.delta.stop_reason;
                }
            }
        }
        return fullMessage;
    }
    async validateConfiguration() {
        try {
            await this.sdk.messages.create({
                model: 'claude-3-haiku-20240307',
                max_tokens: 1,
                messages: [
                    {
                        role: 'user',
                        content: 'test'
                    }
                ]
            });
            return true;
        } catch (error) {
            if (error instanceof Anthropic.AuthenticationError) {
                console.error('[SDK] Invalid API key');
                return false;
            }
            if (error instanceof Anthropic.RateLimitError) {
                console.warn('[SDK] Rate limit reached but configuration is valid');
                return true;
            }
            console.error('[SDK] Configuration validation failed:', error);
            return false;
        }
    }
    getSwarmMetadata(messageId) {
        return this.swarmMetadata.get(messageId);
    }
    clearSwarmMetadata() {
        this.swarmMetadata.clear();
    }
    logSwarmError(error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.swarmMetadata.set(`error-${Date.now()}`, {
            timestamp: Date.now(),
            error: errorMessage,
            stack: errorStack
        });
    }
    getUsageStats() {
        let totalTokens = 0;
        let messageCount = 0;
        this.swarmMetadata.forEach((metadata)=>{
            if (metadata.tokensUsed) {
                totalTokens += metadata.tokensUsed.total_tokens || 0;
                messageCount++;
            }
        });
        return {
            totalTokens,
            messageCount
        };
    }
}
export const defaultSDKAdapter = new ClaudeFlowSDKAdapter();

//# sourceMappingURL=sdk-config.js.map