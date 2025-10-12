import * as fs from 'fs-extra';
import * as path from 'path';
export class ConfigManager {
    config = {};
    configPath;
    constructor(configPath){
        this.configPath = configPath || this.findConfigFile();
        this.loadConfiguration();
    }
    findConfigFile() {
        const possiblePaths = [
            'claude-flow.config.json',
            'claude-flow.config.js',
            '.claude-flow.json',
            '.claude-flow/config.json',
            'config/claude-flow.json',
            path.join(process.cwd(), 'claude-flow.config.json')
        ];
        for (const configPath of possiblePaths){
            if (fs.existsSync(configPath)) {
                return configPath;
            }
        }
        return 'claude-flow.config.json';
    }
    loadConfiguration() {
        if (fs.existsSync(this.configPath)) {
            try {
                const fileContent = fs.readFileSync(this.configPath, 'utf8');
                this.config = JSON.parse(fileContent);
            } catch (error) {
                console.warn(`Failed to load config from ${this.configPath}:`, error);
            }
        }
        this.loadEnvironmentVariables();
    }
    loadEnvironmentVariables() {
        const envConfig = {};
        if (process.env.CLAUDE_FLOW_MODE) envConfig.mode = process.env.CLAUDE_FLOW_MODE;
        if (process.env.CLAUDE_FLOW_TOPOLOGY) envConfig.topology = process.env.CLAUDE_FLOW_TOPOLOGY;
        if (process.env.CLAUDE_FLOW_MAX_AGENTS) envConfig.maxAgents = parseInt(process.env.CLAUDE_FLOW_MAX_AGENTS);
        if (process.env.CLAUDE_FLOW_STRATEGY) envConfig.strategy = process.env.CLAUDE_FLOW_STRATEGY;
        if (process.env.CLAUDE_FLOW_DATABASE_TYPE || process.env.CLAUDE_FLOW_DATABASE_PATH) {
            envConfig.database = {
                type: process.env.CLAUDE_FLOW_DATABASE_TYPE || 'sqlite',
                path: process.env.CLAUDE_FLOW_DATABASE_PATH
            };
        }
        if (process.env.GITHUB_TOKEN) {
            envConfig.github = {
                token: process.env.GITHUB_TOKEN,
                owner: process.env.GITHUB_OWNER,
                repo: process.env.GITHUB_REPO,
                webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
                autoSync: process.env.GITHUB_AUTO_SYNC === 'true'
            };
        }
        if (process.env.CLAUDE_FLOW_DEBUG) envConfig.debug = process.env.CLAUDE_FLOW_DEBUG === 'true';
        if (process.env.CLAUDE_FLOW_LOG_LEVEL) envConfig.logLevel = process.env.CLAUDE_FLOW_LOG_LEVEL;
        this.config = {
            ...this.config,
            ...envConfig
        };
    }
    async validate() {
        const errors = [];
        const warnings = [];
        const validModes = [
            'standard',
            'github',
            'hive-mind',
            'sparc',
            'neural',
            'enterprise'
        ];
        if (this.config.mode && !validModes.includes(this.config.mode)) {
            errors.push(`Invalid mode: ${this.config.mode}. Valid modes: ${validModes.join(', ')}`);
        }
        const validTopologies = [
            'mesh',
            'hierarchical',
            'ring',
            'star'
        ];
        if (this.config.topology && !validTopologies.includes(this.config.topology)) {
            errors.push(`Invalid topology: ${this.config.topology}. Valid topologies: ${validTopologies.join(', ')}`);
        }
        if (this.config.maxAgents !== undefined) {
            if (this.config.maxAgents < 1 || this.config.maxAgents > 100) {
                errors.push('maxAgents must be between 1 and 100');
            }
        }
        const validStrategies = [
            'balanced',
            'specialized',
            'adaptive'
        ];
        if (this.config.strategy && !validStrategies.includes(this.config.strategy)) {
            errors.push(`Invalid strategy: ${this.config.strategy}. Valid strategies: ${validStrategies.join(', ')}`);
        }
        if (this.config.database) {
            if (![
                'sqlite',
                'json'
            ].includes(this.config.database.type)) {
                errors.push('Database type must be either "sqlite" or "json"');
            }
            if (this.config.database.path && !fs.existsSync(path.dirname(this.config.database.path))) {
                warnings.push(`Database directory does not exist: ${path.dirname(this.config.database.path)}`);
            }
        }
        if (this.config.github?.token && !this.config.github.token.startsWith('ghp_')) {
            warnings.push('GitHub token format appears invalid');
        }
        if (this.config.performance?.maxConcurrency && this.config.performance.maxConcurrency < 1) {
            errors.push('maxConcurrency must be at least 1');
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    getConfig() {
        return {
            ...this.config
        };
    }
    get(key) {
        return this.config[key];
    }
    set(key, value) {
        this.config[key] = value;
    }
    async save() {
        try {
            await fs.ensureDir(path.dirname(this.configPath));
            await fs.writeJSON(this.configPath, this.config, {
                spaces: 2
            });
        } catch (error) {
            throw new Error(`Failed to save configuration: ${error}`);
        }
    }
    reset() {
        this.config = {
            mode: 'standard',
            topology: 'mesh',
            maxAgents: 8,
            strategy: 'balanced',
            database: {
                type: 'sqlite',
                path: '.claude-flow/database.sqlite'
            },
            debug: false,
            logLevel: 'info'
        };
    }
    merge(additionalConfig) {
        this.config = {
            ...this.config,
            ...additionalConfig
        };
    }
    toInitConfig() {
        return {
            mode: this.config.mode,
            topology: this.config.topology,
            maxAgents: this.config.maxAgents,
            strategy: this.config.strategy,
            database: this.config.database?.type,
            debug: this.config.debug
        };
    }
}

//# sourceMappingURL=ConfigManager.js.map