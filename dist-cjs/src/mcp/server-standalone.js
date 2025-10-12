#!/usr/bin/env node
const VERSION = '2.5.0-alpha.130';
async function main() {
    const { fileURLToPath } = await import('url');
    const { pathToFileURL } = await import('url');
    const path = await import('path');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const { MCPServer } = await import(pathToFileURL(path.join(__dirname, 'server.js')).href);
    const { ConsoleLogger } = await import(pathToFileURL(path.join(__dirname, '../core/logger.js')).href);
    const { createOrchestrator } = await import(pathToFileURL(path.join(__dirname, '../core/orchestrator.js')).href);
    const logger = new ConsoleLogger();
    logger.info('[claude-flow-mcp] Claude-Flow MCP server starting', {
        version: VERSION,
        phase: 'Phase 4 - SDK Integration',
        features: [
            'Parallel Agent Spawning',
            'Real-Time Query Control',
            'Query Monitoring'
        ]
    });
    try {
        const orchestrator = await createOrchestrator({
            logger,
            enableNeural: process.env.CLAUDE_FLOW_NEURAL_ENABLED === 'true',
            enableWasm: process.env.CLAUDE_FLOW_WASM_ENABLED === 'true'
        });
        const server = new MCPServer({
            transport: 'stdio',
            logger,
            orchestrator,
            enableSwarmTools: true,
            enableRuvSwarmTools: true
        });
        await server.start();
        logger.success('[claude-flow-mcp] Server started successfully', {
            transport: 'stdio',
            tools: 'claude-flow + swarm + ruv-swarm',
            phase4Tools: [
                'agents_spawn_parallel',
                'query_control',
                'query_list'
            ]
        });
        process.on('SIGINT', async ()=>{
            logger.info('[claude-flow-mcp] Shutting down gracefully...');
            await server.stop();
            process.exit(0);
        });
        process.on('SIGTERM', async ()=>{
            logger.info('[claude-flow-mcp] Shutting down gracefully...');
            await server.stop();
            process.exit(0);
        });
    } catch (error) {
        logger.error('[claude-flow-mcp] Failed to start server', {
            error
        });
        process.exit(1);
    }
}
main().catch((error)=>{
    console.error('Fatal error:', error);
    process.exit(1);
});

//# sourceMappingURL=server-standalone.js.map