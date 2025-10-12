import { query } from '@anthropic-ai/claude-code/sdk';
import { createClaudeFlowSdkServer } from './tool-registry.js';
import { logger } from '../core/logger.js';
export class SDKIntegration {
    sdkServer;
    registry;
    config;
    constructor(config){
        this.config = {
            fallbackToStdio: true,
            ...config
        };
        logger.info('SDKIntegration initialized', {
            enableInProcess: config.enableInProcess,
            enableMetrics: config.enableMetrics
        });
    }
    async initialize() {
        if (!this.config.enableInProcess) {
            logger.info('In-process MCP server disabled, using stdio fallback');
            return;
        }
        logger.info('Initializing in-process MCP server...');
        try {
            this.sdkServer = await createClaudeFlowSdkServer(this.config.orchestratorContext);
            logger.info('In-process MCP server initialized successfully', {
                serverName: this.sdkServer.name,
                transport: 'in-process'
            });
        } catch (error) {
            logger.error('Failed to initialize in-process MCP server', {
                error
            });
            if (!this.config.fallbackToStdio) {
                throw error;
            }
            logger.warn('Falling back to stdio transport');
        }
    }
    query(prompt, options) {
        const queryOptions = {
            ...options
        };
        if (this.sdkServer) {
            queryOptions.mcpServers = {
                ...queryOptions.mcpServers,
                'claude-flow': this.sdkServer
            };
            logger.debug('Query created with in-process MCP server', {
                mcpServers: Object.keys(queryOptions.mcpServers || {})
            });
        } else {
            logger.debug('Query created without in-process server (fallback mode)');
        }
        return query({
            prompt,
            options: queryOptions
        });
    }
    async queryAgent(agentId, prompt, options) {
        const queryOptions = {
            ...options,
            mcpServers: {
                ...options?.mcpServers
            }
        };
        if (this.sdkServer) {
            queryOptions.mcpServers['claude-flow'] = this.sdkServer;
        }
        if (this.config.orchestratorContext) {
            logger.debug('Creating agent query with orchestrator context', {
                agentId
            });
        }
        return query({
            prompt,
            options: queryOptions
        });
    }
    getSdkServer() {
        return this.sdkServer;
    }
    isInProcessAvailable() {
        return this.sdkServer !== undefined;
    }
    getMetrics() {
        if (!this.registry) {
            return {
                error: 'Tool registry not available'
            };
        }
        return this.registry.getMetrics();
    }
    getPerformanceComparison() {
        if (!this.registry) {
            return {
                error: 'Tool registry not available'
            };
        }
        return this.registry.getPerformanceComparison();
    }
    async cleanup() {
        if (this.registry) {
            await this.registry.cleanup();
        }
        this.sdkServer = undefined;
        logger.info('SDK integration cleaned up');
    }
}
let globalIntegration;
export async function initializeSDKIntegration(config) {
    if (globalIntegration) {
        logger.warn('SDK integration already initialized, returning existing instance');
        return globalIntegration;
    }
    globalIntegration = new SDKIntegration(config);
    await globalIntegration.initialize();
    return globalIntegration;
}
export function getSDKIntegration() {
    return globalIntegration;
}
export async function createInProcessQuery(prompt, options, orchestratorContext) {
    if (!globalIntegration) {
        await initializeSDKIntegration({
            enableInProcess: true,
            enableMetrics: true,
            enableCaching: true,
            orchestratorContext
        });
    }
    return globalIntegration.query(prompt, options);
}
export async function getInProcessServerConfig(orchestratorContext) {
    if (!globalIntegration) {
        await initializeSDKIntegration({
            enableInProcess: true,
            enableMetrics: true,
            enableCaching: true,
            orchestratorContext
        });
    }
    const server = globalIntegration?.getSdkServer();
    if (!server) {
        throw new Error('In-process MCP server not available');
    }
    return server;
}
export async function measurePerformance(toolName, args, iterations = 10) {
    if (!globalIntegration || !globalIntegration.isInProcessAvailable()) {
        throw new Error('In-process server not available for performance testing');
    }
    const durations = [];
    logger.info('Starting performance measurement', {
        toolName,
        iterations
    });
    for(let i = 0; i < iterations; i++){
        const start = performance.now();
        const query = globalIntegration.query(`Execute tool: ${toolName}`, {
            allowedTools: [
                toolName
            ]
        });
        for await (const message of query){
            if (message.type === 'result') {
                break;
            }
        }
        const duration = performance.now() - start;
        durations.push(duration);
    }
    const inProcessAvg = durations.reduce((a, b)=>a + b, 0) / durations.length;
    const inProcessMin = Math.min(...durations);
    const inProcessMax = Math.max(...durations);
    const estimatedIPCAvg = inProcessAvg * 50;
    const speedupFactor = estimatedIPCAvg / inProcessAvg;
    logger.info('Performance measurement complete', {
        toolName,
        inProcessAvg: `${inProcessAvg.toFixed(2)}ms`,
        estimatedIPCAvg: `${estimatedIPCAvg.toFixed(2)}ms`,
        speedupFactor: `${speedupFactor.toFixed(1)}x`
    });
    return {
        inProcessAvg,
        inProcessMin,
        inProcessMax,
        estimatedIPCAvg,
        speedupFactor
    };
}

//# sourceMappingURL=sdk-integration.js.map