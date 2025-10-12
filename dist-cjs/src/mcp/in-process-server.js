import { EventEmitter } from 'node:events';
import { logger } from '../core/logger.js';
export class InProcessMCPServer extends EventEmitter {
    name;
    version;
    tools;
    metrics;
    context;
    enableMetrics;
    enableCaching;
    cache;
    constructor(config){
        super();
        this.name = config.name;
        this.version = config.version || '1.0.0';
        this.tools = new Map();
        this.metrics = [];
        this.enableMetrics = config.enableMetrics !== false;
        this.enableCaching = config.enableCaching !== false;
        this.cache = new Map();
        if (config.tools) {
            config.tools.forEach((tool)=>this.registerTool(tool));
        }
        logger.info('InProcessMCPServer initialized', {
            name: this.name,
            version: this.version,
            toolCount: this.tools.size
        });
    }
    registerTool(tool) {
        if (this.tools.has(tool.name)) {
            logger.warn('Tool already registered, overwriting', {
                name: tool.name
            });
        }
        this.tools.set(tool.name, tool);
        logger.debug('Tool registered', {
            name: tool.name
        });
        this.emit('toolRegistered', tool.name);
    }
    unregisterTool(name) {
        const deleted = this.tools.delete(name);
        if (deleted) {
            logger.debug('Tool unregistered', {
                name
            });
            this.emit('toolUnregistered', name);
        }
        return deleted;
    }
    getToolNames() {
        return Array.from(this.tools.keys());
    }
    getTool(name) {
        return this.tools.get(name);
    }
    async callTool(name, args, context) {
        const startTime = performance.now();
        let success = false;
        try {
            if (this.enableCaching) {
                const cached = this.checkCache(name, args);
                if (cached) {
                    logger.debug('Cache hit for tool', {
                        name
                    });
                    success = true;
                    return cached;
                }
            }
            const tool = this.tools.get(name);
            if (!tool) {
                throw new Error(`Tool not found: ${name}`);
            }
            logger.debug('Executing tool in-process', {
                name,
                args
            });
            const execContext = {
                ...this.context,
                ...context
            };
            const result = await tool.handler(args, execContext);
            if (this.enableCaching && this.isCacheable(name)) {
                this.cacheResult(name, args, result);
            }
            success = true;
            return {
                content: [
                    {
                        type: 'text',
                        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                    }
                ],
                isError: false
            };
        } catch (error) {
            logger.error('Tool execution failed', {
                name,
                error
            });
            success = false;
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`
                    }
                ],
                isError: true
            };
        } finally{
            if (this.enableMetrics) {
                const duration = performance.now() - startTime;
                this.recordMetric({
                    toolName: name,
                    duration,
                    success,
                    timestamp: Date.now(),
                    transport: 'in-process'
                });
            }
        }
    }
    setContext(context) {
        this.context = context;
        logger.debug('Context updated', {
            sessionId: context.sessionId
        });
    }
    getMetrics() {
        return [
            ...this.metrics
        ];
    }
    getStats() {
        const stats = {};
        const grouped = new Map();
        for (const metric of this.metrics){
            if (!grouped.has(metric.toolName)) {
                grouped.set(metric.toolName, []);
            }
            grouped.get(metric.toolName).push(metric);
        }
        for (const [toolName, metrics] of grouped){
            const totalCalls = metrics.length;
            const successfulCalls = metrics.filter((m)=>m.success).length;
            const durations = metrics.map((m)=>m.duration);
            const avgDuration = durations.reduce((a, b)=>a + b, 0) / durations.length;
            const minDuration = Math.min(...durations);
            const maxDuration = Math.max(...durations);
            stats[toolName] = {
                totalCalls,
                successRate: successfulCalls / totalCalls,
                avgDuration,
                minDuration,
                maxDuration
            };
        }
        return {
            toolStats: stats,
            totalCalls: this.metrics.length,
            averageDuration: this.metrics.reduce((sum, m)=>sum + m.duration, 0) / this.metrics.length || 0,
            cacheHitRate: this.getCacheHitRate()
        };
    }
    clearMetrics() {
        this.metrics = [];
        logger.debug('Metrics cleared');
    }
    clearCache() {
        this.cache.clear();
        logger.debug('Cache cleared');
    }
    getInfo() {
        return {
            name: this.name,
            version: this.version,
            toolCount: this.tools.size,
            tools: this.getToolNames(),
            metrics: {
                totalCalls: this.metrics.length,
                cacheSize: this.cache.size
            }
        };
    }
    recordMetric(metric) {
        this.metrics.push(metric);
        this.emit('metricRecorded', metric);
        if (this.metrics.length > 1000) {
            this.metrics = this.metrics.slice(-1000);
        }
    }
    checkCache(name, args) {
        const cacheKey = this.getCacheKey(name, args);
        const cached = this.cache.get(cacheKey);
        if (cached) {
            const now = Date.now();
            if (now - cached.timestamp < cached.ttl) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: typeof cached.result === 'string' ? cached.result : JSON.stringify(cached.result, null, 2)
                        }
                    ],
                    isError: false
                };
            } else {
                this.cache.delete(cacheKey);
            }
        }
        return undefined;
    }
    cacheResult(name, args, result) {
        const cacheKey = this.getCacheKey(name, args);
        const ttl = this.getCacheTTL(name);
        this.cache.set(cacheKey, {
            result,
            timestamp: Date.now(),
            ttl
        });
        if (this.cache.size > 100) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }
    }
    getCacheKey(name, args) {
        return `${name}:${JSON.stringify(args)}`;
    }
    isCacheable(name) {
        const cacheableTools = [
            'agents/list',
            'agents/info',
            'tasks/list',
            'tasks/status',
            'system/status',
            'system/metrics',
            'config/get',
            'workflow/list',
            'terminal/list'
        ];
        return cacheableTools.includes(name);
    }
    getCacheTTL(name) {
        const ttls = {
            'agents/list': 5000,
            'agents/info': 10000,
            'system/status': 2000,
            'config/get': 30000
        };
        return ttls[name] || 10000;
    }
    getCacheHitRate() {
        if (this.metrics.length === 0) return 0;
        const cacheableMetrics = this.metrics.filter((m)=>this.isCacheable(m.toolName));
        if (cacheableMetrics.length === 0) return 0;
        const likelyCacheHits = cacheableMetrics.filter((m)=>m.duration < 1).length;
        return likelyCacheHits / cacheableMetrics.length;
    }
}
export function createInProcessServer(config) {
    return new InProcessMCPServer(config);
}

//# sourceMappingURL=in-process-server.js.map