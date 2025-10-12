export class StandardInit {
    getDescription() {
        return 'Standard initialization mode with basic agent coordination and mesh topology';
    }
    getRequiredComponents() {
        return [
            'ConfigManager',
            'DatabaseManager',
            'TopologyManager',
            'AgentRegistry'
        ];
    }
    validate() {
        return true;
    }
    async initialize(config) {
        const components = [];
        try {
            if (config.configManager) {
                components.push('ConfigManager');
            }
            if (config.databaseManager) {
                await config.databaseManager.initialize();
                components.push('DatabaseManager');
            }
            if (config.topologyManager) {
                await config.topologyManager.configure('mesh', []);
                components.push('TopologyManager');
            }
            if (config.agentRegistry) {
                await config.agentRegistry.initialize();
                components.push('AgentRegistry');
            }
            if (config.agentRegistry) {
                await config.agentRegistry.spawn('coordinator', {
                    capabilities: [
                        'coordination',
                        'task-management'
                    ]
                });
                await config.agentRegistry.spawn('researcher', {
                    capabilities: [
                        'research',
                        'analysis'
                    ]
                });
                await config.agentRegistry.spawn('coder', {
                    capabilities: [
                        'programming',
                        'debugging'
                    ]
                });
                components.push('DefaultAgents');
            }
            return {
                success: true,
                mode: 'standard',
                components,
                topology: 'mesh',
                message: 'Standard initialization completed successfully'
            };
        } catch (error) {
            return {
                success: false,
                mode: 'standard',
                components,
                error: error instanceof Error ? error.message : String(error),
                message: 'Standard initialization failed'
            };
        }
    }
}

//# sourceMappingURL=StandardInit.js.map