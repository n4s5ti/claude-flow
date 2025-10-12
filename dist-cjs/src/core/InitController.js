import { ConfigManager } from './ConfigManager.js';
import { DatabaseManager } from './DatabaseManager.js';
import { ModeFactory } from './ModeFactory.js';
import { TopologyManager } from './TopologyManager.js';
import { AgentRegistry } from './AgentRegistry.js';
import { MetricsCollector } from './MetricsCollector.js';
export class InitController {
    config;
    configManager;
    databaseManager;
    modeFactory;
    topologyManager;
    agentRegistry;
    metricsCollector;
    initialized = false;
    constructor(config = {}){
        this.config = config;
        this.configManager = new ConfigManager(config.configPath);
        this.databaseManager = new DatabaseManager(config.database || 'sqlite');
        this.modeFactory = new ModeFactory();
        this.topologyManager = new TopologyManager(this.databaseManager);
        this.agentRegistry = new AgentRegistry(this.databaseManager);
        this.metricsCollector = new MetricsCollector(this.databaseManager);
    }
    async initialize() {
        const startTime = Date.now();
        try {
            const validationResult = await this.configManager.validate();
            if (!validationResult.valid) {
                throw new Error(`Configuration validation failed: ${validationResult.errors.join(', ')}`);
            }
            await this.databaseManager.initialize();
            await this.topologyManager.configure(this.config.topology || 'mesh');
            await this.agentRegistry.initialize();
            const mode = this.modeFactory.createMode(this.config.mode || 'standard');
            const initConfig = {
                ...this.config,
                configManager: this.configManager,
                databaseManager: this.databaseManager,
                topologyManager: this.topologyManager,
                agentRegistry: this.agentRegistry,
                metricsCollector: this.metricsCollector
            };
            const result = await mode.initialize(initConfig);
            const endTime = Date.now();
            await this.metricsCollector.recordInitialization({
                mode: this.config.mode || 'standard',
                duration: endTime - startTime,
                success: true,
                components: result.components || [],
                timestamp: new Date().toISOString()
            });
            this.initialized = true;
            return {
                success: true,
                mode: this.config.mode || 'standard',
                components: result.components,
                topology: this.config.topology || 'mesh',
                duration: endTime - startTime,
                message: result.message || 'Initialization completed successfully',
                metadata: {
                    configValid: true,
                    databaseInitialized: true,
                    topologyConfigured: true,
                    agentRegistryReady: true,
                    ...result.metadata
                }
            };
        } catch (error) {
            const endTime = Date.now();
            await this.metricsCollector.recordInitialization({
                mode: this.config.mode || 'standard',
                duration: endTime - startTime,
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: new Date().toISOString()
            });
            return {
                success: false,
                mode: this.config.mode || 'standard',
                duration: endTime - startTime,
                error: error instanceof Error ? error.message : String(error),
                message: 'Initialization failed'
            };
        }
    }
    getStatus() {
        return {
            initialized: this.initialized,
            mode: this.config.mode,
            components: this.initialized ? [
                'ConfigManager',
                'DatabaseManager',
                'TopologyManager',
                'AgentRegistry'
            ] : []
        };
    }
    async shutdown() {
        if (this.databaseManager) {
            await this.databaseManager.close();
        }
        this.initialized = false;
    }
    async validateConfiguration() {
        return await this.configManager.validate();
    }
    getAvailableModes() {
        return this.modeFactory.getAvailableModes();
    }
    async getTopologyInfo() {
        return await this.topologyManager.getTopologyInfo();
    }
    async getAgents() {
        return await this.agentRegistry.getActiveAgents();
    }
    async getMetrics() {
        return await this.metricsCollector.getInitializationMetrics();
    }
}

//# sourceMappingURL=InitController.js.map