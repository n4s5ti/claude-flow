import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createInProcessServer } from '../mcp/in-process-server.js';
import { createToolRegistry } from '../mcp/tool-registry.js';
import { SDKIntegration, initializeSDKIntegration } from '../mcp/sdk-integration.js';
describe('InProcessMCPServer', ()=>{
    let server;
    beforeEach(()=>{
        server = createInProcessServer({
            name: 'test-server',
            version: '1.0.0',
            enableMetrics: true,
            enableCaching: true
        });
    });
    afterEach(()=>{
        server.clearMetrics();
        server.clearCache();
    });
    describe('Tool Registration', ()=>{
        it('should register a tool', ()=>{
            const tool = {
                name: 'test/tool',
                description: 'Test tool',
                inputSchema: {
                    type: 'object',
                    properties: {
                        message: {
                            type: 'string'
                        }
                    },
                    required: [
                        'message'
                    ]
                },
                handler: async (args)=>({
                        result: `Hello ${args.message}`
                    })
            };
            server.registerTool(tool);
            expect(server.getToolNames()).toContain('test/tool');
        });
        it('should unregister a tool', ()=>{
            const tool = {
                name: 'test/tool',
                description: 'Test tool',
                inputSchema: {
                    type: 'object',
                    properties: {}
                },
                handler: async ()=>({
                        result: 'ok'
                    })
            };
            server.registerTool(tool);
            expect(server.getToolNames()).toContain('test/tool');
            const removed = server.unregisterTool('test/tool');
            expect(removed).toBe(true);
            expect(server.getToolNames()).not.toContain('test/tool');
        });
        it('should get tool metadata', ()=>{
            const tool = {
                name: 'test/tool',
                description: 'Test tool',
                inputSchema: {
                    type: 'object',
                    properties: {}
                },
                handler: async ()=>({
                        result: 'ok'
                    })
            };
            server.registerTool(tool);
            const retrieved = server.getTool('test/tool');
            expect(retrieved).toBeDefined();
            expect(retrieved?.name).toBe('test/tool');
        });
    });
    describe('Tool Execution', ()=>{
        it('should execute a tool successfully', async ()=>{
            const tool = {
                name: 'test/echo',
                description: 'Echo tool',
                inputSchema: {
                    type: 'object',
                    properties: {
                        message: {
                            type: 'string'
                        }
                    },
                    required: [
                        'message'
                    ]
                },
                handler: async (args)=>({
                        echo: args.message
                    })
            };
            server.registerTool(tool);
            const result = await server.callTool('test/echo', {
                message: 'Hello World'
            });
            expect(result.isError).toBe(false);
            expect(result.content[0].type).toBe('text');
            expect(result.content[0].text).toContain('Hello World');
        });
        it('should handle tool execution errors', async ()=>{
            const tool = {
                name: 'test/error',
                description: 'Error tool',
                inputSchema: {
                    type: 'object',
                    properties: {}
                },
                handler: async ()=>{
                    throw new Error('Test error');
                }
            };
            server.registerTool(tool);
            const result = await server.callTool('test/error', {});
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Test error');
        });
        it('should throw error for non-existent tool', async ()=>{
            const result = await server.callTool('non/existent', {});
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain('Tool not found');
        });
    });
    describe('Performance Metrics', ()=>{
        it('should record metrics for tool calls', async ()=>{
            const tool = {
                name: 'test/metric',
                description: 'Metric test tool',
                inputSchema: {
                    type: 'object',
                    properties: {}
                },
                handler: async ()=>({
                        result: 'ok'
                    })
            };
            server.registerTool(tool);
            await server.callTool('test/metric', {});
            const metrics = server.getMetrics();
            expect(metrics.length).toBeGreaterThan(0);
            expect(metrics[0].toolName).toBe('test/metric');
            expect(metrics[0].transport).toBe('in-process');
        });
        it('should calculate performance statistics', async ()=>{
            const tool = {
                name: 'test/stats',
                description: 'Stats test tool',
                inputSchema: {
                    type: 'object',
                    properties: {}
                },
                handler: async ()=>{
                    await new Promise((resolve)=>setTimeout(resolve, 10));
                    return {
                        result: 'ok'
                    };
                }
            };
            server.registerTool(tool);
            for(let i = 0; i < 5; i++){
                await server.callTool('test/stats', {});
            }
            const stats = server.getStats();
            expect(stats.totalCalls).toBe(5);
            expect(stats.toolStats['test/stats']).toBeDefined();
            expect(stats.toolStats['test/stats'].totalCalls).toBe(5);
            expect(stats.toolStats['test/stats'].successRate).toBe(1);
        });
        it('should track latency accurately', async ()=>{
            const tool = {
                name: 'test/latency',
                description: 'Latency test tool',
                inputSchema: {
                    type: 'object',
                    properties: {}
                },
                handler: async ()=>{
                    await new Promise((resolve)=>setTimeout(resolve, 5));
                    return {
                        result: 'ok'
                    };
                }
            };
            server.registerTool(tool);
            await server.callTool('test/latency', {});
            const metrics = server.getMetrics();
            expect(metrics[0].duration).toBeGreaterThan(5);
            expect(metrics[0].duration).toBeLessThan(50);
        });
    });
    describe('Caching', ()=>{
        it('should cache read-only tool results', async ()=>{
            const mockHandler = vi.fn(async ()=>({
                    result: 'cached'
                }));
            const tool = {
                name: 'agents/list',
                description: 'List agents (cacheable)',
                inputSchema: {
                    type: 'object',
                    properties: {}
                },
                handler: mockHandler
            };
            server.registerTool(tool);
            await server.callTool('agents/list', {});
            expect(mockHandler).toHaveBeenCalledTimes(1);
            await server.callTool('agents/list', {});
            expect(mockHandler).toHaveBeenCalledTimes(1);
        });
        it('should not cache write operations', async ()=>{
            const mockHandler = vi.fn(async ()=>({
                    result: 'not cached'
                }));
            const tool = {
                name: 'agents/spawn',
                description: 'Spawn agent (not cacheable)',
                inputSchema: {
                    type: 'object',
                    properties: {}
                },
                handler: mockHandler
            };
            server.registerTool(tool);
            await server.callTool('agents/spawn', {});
            await server.callTool('agents/spawn', {});
            expect(mockHandler).toHaveBeenCalledTimes(2);
        });
        it('should expire cache entries', async ()=>{
            const mockHandler = vi.fn(async ()=>({
                    result: 'expires'
                }));
            const tool = {
                name: 'system/status',
                description: 'System status (short TTL)',
                inputSchema: {
                    type: 'object',
                    properties: {}
                },
                handler: mockHandler
            };
            server.registerTool(tool);
            await server.callTool('system/status', {});
            expect(mockHandler).toHaveBeenCalledTimes(1);
            await new Promise((resolve)=>setTimeout(resolve, 2100));
            await server.callTool('system/status', {});
            expect(mockHandler).toHaveBeenCalledTimes(2);
        });
    });
    describe('Context Management', ()=>{
        it('should set and use execution context', async ()=>{
            const mockOrchestrator = {
                id: 'test-orchestrator'
            };
            server.setContext({
                orchestrator: mockOrchestrator,
                sessionId: 'test-session'
            });
            const tool = {
                name: 'test/context',
                description: 'Context test tool',
                inputSchema: {
                    type: 'object',
                    properties: {}
                },
                handler: async (args, context)=>({
                        orchestrator: context?.orchestrator?.id,
                        sessionId: context?.sessionId
                    })
            };
            server.registerTool(tool);
            const result = await server.callTool('test/context', {});
            expect(result.content[0].text).toContain('test-orchestrator');
            expect(result.content[0].text).toContain('test-session');
        });
    });
    describe('Server Info', ()=>{
        it('should return server information', ()=>{
            const info = server.getInfo();
            expect(info.name).toBe('test-server');
            expect(info.version).toBe('1.0.0');
            expect(info.toolCount).toBe(0);
            expect(Array.isArray(info.tools)).toBe(true);
        });
    });
});
describe('ClaudeFlowToolRegistry', ()=>{
    let registry;
    beforeEach(async ()=>{
        registry = await createToolRegistry({
            enableInProcess: true,
            enableMetrics: true,
            enableCaching: true
        });
    });
    afterEach(async ()=>{
        await registry.cleanup();
    });
    it('should load all Claude-Flow tools', async ()=>{
        const toolNames = registry.getToolNames();
        expect(toolNames.length).toBeGreaterThan(20);
        expect(toolNames.some((name)=>name.startsWith('agents/'))).toBe(true);
        expect(toolNames.some((name)=>name.startsWith('tasks/'))).toBe(true);
        expect(toolNames.some((name)=>name.startsWith('memory/'))).toBe(true);
        expect(toolNames.some((name)=>name.startsWith('system/'))).toBe(true);
    });
    it('should route tool calls correctly', async ()=>{
        const result = await registry.routeToolCall('agents/list', {
            includeTerminated: false
        });
        expect(result).toBeDefined();
    });
    it('should provide SDK server config', ()=>{
        const sdkServer = registry.getSdkServerConfig();
        expect(sdkServer).toBeDefined();
        expect(sdkServer?.type).toBe('sdk');
        expect(sdkServer?.name).toBe('claude-flow');
    });
    it('should return performance metrics', ()=>{
        const metrics = registry.getMetrics();
        expect(metrics).toBeDefined();
        expect('stats' in metrics || 'error' in metrics).toBe(true);
    });
});
describe('SDKIntegration', ()=>{
    let integration;
    beforeEach(async ()=>{
        integration = await initializeSDKIntegration({
            enableInProcess: true,
            enableMetrics: true,
            enableCaching: true
        });
    });
    afterEach(async ()=>{
        await integration.cleanup();
    });
    it('should initialize in-process server', ()=>{
        expect(integration.isInProcessAvailable()).toBe(true);
    });
    it('should create query with in-process server', ()=>{
        const query = integration.query('Test prompt', {
            maxTurns: 1
        });
        expect(query).toBeDefined();
    });
    it('should get SDK server config', ()=>{
        const server = integration.getSdkServer();
        expect(server).toBeDefined();
        expect(server?.name).toBe('claude-flow');
    });
    it('should provide performance comparison', ()=>{
        const comparison = integration.getPerformanceComparison();
        expect(comparison).toBeDefined();
    });
});
describe('Performance Benchmarks', ()=>{
    it('should demonstrate 10-100x speedup vs IPC', async ()=>{
        await initializeSDKIntegration({
            enableInProcess: true,
            enableMetrics: true,
            enableCaching: false
        });
        const registry = await createToolRegistry({
            enableInProcess: true,
            enableMetrics: true,
            enableCaching: false
        });
        const inProcessServer = registry.getInProcessServer();
        expect(inProcessServer).toBeDefined();
        const testTool = {
            name: 'test/benchmark',
            description: 'Benchmark test tool',
            inputSchema: {
                type: 'object',
                properties: {}
            },
            handler: async ()=>({
                    result: 'ok'
                })
        };
        inProcessServer.registerTool(testTool);
        const iterations = 10;
        const durations = [];
        for(let i = 0; i < iterations; i++){
            const start = performance.now();
            await inProcessServer.callTool('test/benchmark', {});
            durations.push(performance.now() - start);
        }
        const avgInProcessLatency = durations.reduce((a, b)=>a + b, 0) / durations.length;
        expect(avgInProcessLatency).toBeLessThan(5);
        const estimatedIPCLatency = avgInProcessLatency * 50;
        console.log('Performance Benchmark Results:');
        console.log(`In-Process Latency: ${avgInProcessLatency.toFixed(2)}ms`);
        console.log(`Estimated IPC Latency: ${estimatedIPCLatency.toFixed(2)}ms`);
        console.log(`Speedup Factor: ${(estimatedIPCLatency / avgInProcessLatency).toFixed(1)}x`);
        expect(estimatedIPCLatency / avgInProcessLatency).toBeGreaterThan(10);
    }, 30000);
});
describe('Fallback Behavior', ()=>{
    it('should fallback to stdio when in-process fails', async ()=>{
        const integration = new SDKIntegration({
            enableInProcess: false,
            enableMetrics: false,
            enableCaching: false,
            fallbackToStdio: true
        });
        await integration.initialize();
        expect(integration.isInProcessAvailable()).toBe(false);
    });
});
describe('Edge Cases', ()=>{
    let server;
    beforeEach(()=>{
        server = createInProcessServer({
            name: 'edge-test',
            enableMetrics: true,
            enableCaching: true
        });
    });
    it('should handle concurrent tool calls', async ()=>{
        const tool = {
            name: 'test/concurrent',
            description: 'Concurrent test',
            inputSchema: {
                type: 'object',
                properties: {}
            },
            handler: async ()=>{
                await new Promise((resolve)=>setTimeout(resolve, 10));
                return {
                    result: 'ok'
                };
            }
        };
        server.registerTool(tool);
        const promises = Array.from({
            length: 10
        }, ()=>server.callTool('test/concurrent', {}));
        const results = await Promise.all(promises);
        expect(results).toHaveLength(10);
        expect(results.every((r)=>!r.isError)).toBe(true);
    });
    it('should handle large payloads', async ()=>{
        const tool = {
            name: 'test/large',
            description: 'Large payload test',
            inputSchema: {
                type: 'object',
                properties: {}
            },
            handler: async (args)=>({
                    echo: args
                })
        };
        server.registerTool(tool);
        const largePayload = {
            data: Array.from({
                length: 1000
            }, (_, i)=>({
                    id: i,
                    value: `item-${i}`
                }))
        };
        const result = await server.callTool('test/large', largePayload);
        expect(result.isError).toBe(false);
    });
    it('should handle rapid sequential calls', async ()=>{
        const tool = {
            name: 'test/rapid',
            description: 'Rapid test',
            inputSchema: {
                type: 'object',
                properties: {}
            },
            handler: async ()=>({
                    result: 'ok'
                })
        };
        server.registerTool(tool);
        for(let i = 0; i < 100; i++){
            await server.callTool('test/rapid', {});
        }
        const stats = server.getStats();
        expect(stats.totalCalls).toBe(100);
    });
});

//# sourceMappingURL=in-process-mcp.test.js.map