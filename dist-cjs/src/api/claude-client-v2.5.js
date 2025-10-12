import { EventEmitter } from 'events';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeFlowSDKAdapter } from '../sdk/sdk-config.js';
import { SDKCompatibilityLayer } from '../sdk/compatibility-layer.js';
import { ClaudeAPIError, ClaudeRateLimitError, ClaudeAuthenticationError, ClaudeValidationError } from './claude-api-errors.js';
export class ClaudeClientV25 extends EventEmitter {
    adapter;
    compatibility;
    sdk;
    config;
    logger;
    constructor(config, logger){
        super();
        this.config = config;
        this.logger = logger;
        this.adapter = new ClaudeFlowSDKAdapter({
            apiKey: config.apiKey,
            maxRetries: config.retryAttempts || 3,
            timeout: config.timeout || 60000,
            swarmMode: config.enableSwarmMode,
            baseURL: config.apiUrl
        });
        this.sdk = this.adapter.getSDK();
        this.compatibility = new SDKCompatibilityLayer(this.adapter);
        this.logger?.info('Claude Client v2.5 initialized with SDK', {
            model: config.model,
            swarmMode: config.enableSwarmMode
        });
    }
    async makeRequest(request) {
        try {
            this.emit('request:start', request);
            const sdkParams = {
                model: request.model,
                messages: request.messages.map((msg)=>({
                        role: msg.role,
                        content: msg.content
                    })),
                max_tokens: request.max_tokens,
                temperature: request.temperature,
                top_p: request.top_p,
                top_k: request.top_k,
                system: request.system,
                stop_sequences: request.stop_sequences,
                metadata: request.metadata
            };
            const response = await this.adapter.createMessage(sdkParams);
            const legacyResponse = this.convertSDKResponse(response);
            this.emit('request:success', legacyResponse);
            this.logger?.info('Request successful', {
                model: request.model,
                tokensUsed: response.usage
            });
            return legacyResponse;
        } catch (error) {
            this.handleSDKError(error);
            throw error;
        }
    }
    async makeStreamingRequest(request, onChunk) {
        try {
            this.emit('stream:start', request);
            const sdkParams = {
                model: request.model,
                messages: request.messages.map((msg)=>({
                        role: msg.role,
                        content: msg.content
                    })),
                max_tokens: request.max_tokens,
                temperature: request.temperature,
                system: request.system,
                stream: true
            };
            const response = await this.adapter.createStreamingMessage(sdkParams, {
                onChunk: (chunk)=>{
                    this.emit('stream:chunk', chunk);
                    onChunk?.(chunk);
                }
            });
            const legacyResponse = this.convertSDKResponse(response);
            this.emit('stream:complete', legacyResponse);
            return legacyResponse;
        } catch (error) {
            this.handleSDKError(error);
            throw error;
        }
    }
    async executeWithRetry(request) {
        console.warn('[ClaudeClientV25] executeWithRetry is deprecated. SDK handles retry automatically.');
        return this.makeRequest(request);
    }
    convertSDKResponse(sdkResponse) {
        return {
            id: sdkResponse.id,
            type: 'message',
            role: 'assistant',
            content: sdkResponse.content.map((block)=>({
                    type: block.type,
                    text: block.type === 'text' ? block.text : ''
                })),
            model: sdkResponse.model,
            stop_reason: sdkResponse.stop_reason || 'end_turn',
            stop_sequence: sdkResponse.stop_sequence || undefined,
            usage: {
                input_tokens: sdkResponse.usage.input_tokens,
                output_tokens: sdkResponse.usage.output_tokens
            }
        };
    }
    handleSDKError(error) {
        this.emit('request:error', error);
        let mappedError;
        if (error instanceof Anthropic.APIError) {
            if (error instanceof Anthropic.AuthenticationError) {
                mappedError = new ClaudeAuthenticationError('Invalid API key');
            } else if (error instanceof Anthropic.RateLimitError) {
                mappedError = new ClaudeRateLimitError('Rate limit exceeded');
            } else if (error instanceof Anthropic.BadRequestError) {
                mappedError = new ClaudeValidationError(error.message);
            } else {
                mappedError = new ClaudeAPIError(error.message, error.status || 500);
            }
        } else {
            mappedError = new ClaudeAPIError(error.message || 'Unknown error', 500);
        }
        this.logger?.error('SDK request failed', {
            error: mappedError.message,
            status: mappedError.status
        });
        throw mappedError;
    }
    async validateConfiguration() {
        return this.adapter.validateConfiguration();
    }
    getUsageStats() {
        return this.adapter.getUsageStats();
    }
    getSwarmMetadata(messageId) {
        if (this.config.enableSwarmMode) {
            return this.adapter.getSwarmMetadata(messageId);
        }
        return null;
    }
    async checkHealth() {
        try {
            const isValid = await this.validateConfiguration();
            if (isValid) {
                return {
                    status: 'healthy',
                    details: {
                        sdkVersion: '2.5.0',
                        model: this.config.model,
                        swarmMode: this.config.enableSwarmMode
                    }
                };
            }
            return {
                status: 'unhealthy',
                details: {
                    error: 'Invalid configuration'
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                details: {
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            };
        }
    }
    getDeprecationWarnings() {
        return this.compatibility.getDeprecationReport();
    }
}
export { ClaudeClientV25 as ClaudeClient };

//# sourceMappingURL=claude-client-v2.5.js.map