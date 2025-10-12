import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { constants } from 'fs';
export class PermissionManager {
    userConfig;
    projectConfig;
    localConfig;
    sessionConfig;
    cache = new Map();
    cacheEnabled;
    cacheTTL;
    userConfigPath;
    projectConfigPath;
    localConfigPath;
    constructor(options){
        this.cacheEnabled = options?.cacheEnabled ?? true;
        this.cacheTTL = options?.cacheTTL ?? 300000;
        this.userConfigPath = options?.userConfigPath;
        this.projectConfigPath = options?.projectConfigPath;
        this.localConfigPath = options?.localConfigPath;
        this.sessionConfig = this.createDefaultConfig('session');
    }
    async initialize() {
        await Promise.allSettled([
            this.loadUserConfig(),
            this.loadProjectConfig(),
            this.loadLocalConfig()
        ]);
    }
    async resolvePermission(query) {
        const startTime = Date.now();
        if (this.cacheEnabled) {
            const cacheKey = this.generateCacheKey(query);
            const cached = this.cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
                return {
                    ...cached.resolution,
                    cached: true,
                    resolutionTime: Date.now() - startTime
                };
            }
        }
        const fallbackChain = [
            'session',
            'local',
            'project',
            'user'
        ];
        for (const level of fallbackChain){
            const rule = this.findRule(query, level);
            if (rule) {
                const resolution = {
                    behavior: rule.behavior,
                    level,
                    rule,
                    fallbackChain: fallbackChain.slice(0, fallbackChain.indexOf(level) + 1),
                    cached: false,
                    resolutionTime: Date.now() - startTime
                };
                if (this.cacheEnabled) {
                    this.cache.set(this.generateCacheKey(query), {
                        resolution,
                        timestamp: Date.now()
                    });
                }
                return resolution;
            }
        }
        return {
            behavior: 'ask',
            level: 'session',
            fallbackChain,
            cached: false,
            resolutionTime: Date.now() - startTime
        };
    }
    async updatePermissions(level, update) {
        const config = this.getConfigForLevel(level);
        switch(update.type){
            case 'addRules':
                this.addRules(config, update.rules, update.behavior);
                break;
            case 'replaceRules':
                this.replaceRules(config, update.rules, update.behavior);
                break;
            case 'removeRules':
                this.removeRules(config, update.rules);
                break;
            case 'setMode':
                config.mode = update.mode;
                break;
            case 'addDirectories':
                config.allowedDirectories.push(...update.directories);
                break;
            case 'removeDirectories':
                config.allowedDirectories = config.allowedDirectories.filter((d)=>!update.directories.includes(d));
                break;
        }
        this.clearCache();
        if (level !== 'session') {
            await this.saveConfig(level, config);
        }
    }
    getConfig(level) {
        switch(level){
            case 'user':
                return this.userConfig;
            case 'project':
                return this.projectConfig;
            case 'local':
                return this.localConfig;
            case 'session':
                return this.sessionConfig;
        }
    }
    clearCache() {
        this.cache.clear();
    }
    getCacheStats() {
        return {
            size: this.cache.size,
            entries: this.cache.size
        };
    }
    pruneCache() {
        const now = Date.now();
        let pruned = 0;
        for (const [key, entry] of this.cache.entries()){
            if (now - entry.timestamp >= this.cacheTTL) {
                this.cache.delete(key);
                pruned++;
            }
        }
        return pruned;
    }
    async loadUserConfig() {
        if (!this.userConfigPath) return;
        try {
            await access(this.userConfigPath, constants.R_OK);
            const content = await readFile(this.userConfigPath, 'utf-8');
            this.userConfig = JSON.parse(content);
        } catch (error) {
            this.userConfig = this.createDefaultConfig('user');
        }
    }
    async loadProjectConfig() {
        if (!this.projectConfigPath) return;
        try {
            await access(this.projectConfigPath, constants.R_OK);
            const content = await readFile(this.projectConfigPath, 'utf-8');
            this.projectConfig = JSON.parse(content);
        } catch (error) {
            this.projectConfig = this.createDefaultConfig('project');
        }
    }
    async loadLocalConfig() {
        if (!this.localConfigPath) return;
        try {
            await access(this.localConfigPath, constants.R_OK);
            const content = await readFile(this.localConfigPath, 'utf-8');
            this.localConfig = JSON.parse(content);
        } catch (error) {
            this.localConfig = this.createDefaultConfig('local');
        }
    }
    async saveConfig(level, config) {
        let configPath;
        switch(level){
            case 'user':
                configPath = this.userConfigPath;
                break;
            case 'project':
                configPath = this.projectConfigPath;
                break;
            case 'local':
                configPath = this.localConfigPath;
                break;
        }
        if (!configPath) return;
        await mkdir(dirname(configPath), {
            recursive: true
        });
        await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    }
    findRule(query, level) {
        const config = this.getConfigForLevel(level);
        if (!config) return undefined;
        if (config.mode === 'bypassPermissions') {
            return {
                toolName: '*',
                behavior: 'allow',
                scope: level,
                priority: 1000,
                timestamp: Date.now()
            };
        }
        return config.rules.filter((rule)=>this.ruleMatches(rule, query)).sort((a, b)=>b.priority - a.priority)[0];
    }
    ruleMatches(rule, query) {
        if (rule.toolName === query.toolName) {
            return this.ruleContentMatches(rule, query);
        }
        if (rule.toolName === '*') {
            return this.ruleContentMatches(rule, query);
        }
        if (rule.toolName.includes('*')) {
            const pattern = rule.toolName.replace(/\*/g, '.*');
            if (new RegExp(`^${pattern}$`).test(query.toolName)) {
                return this.ruleContentMatches(rule, query);
            }
        }
        return false;
    }
    ruleContentMatches(rule, query) {
        if (!rule.ruleContent || !query.toolInput) {
            return true;
        }
        return true;
    }
    getConfigForLevel(level) {
        switch(level){
            case 'user':
                if (!this.userConfig) {
                    this.userConfig = this.createDefaultConfig('user');
                }
                return this.userConfig;
            case 'project':
                if (!this.projectConfig) {
                    this.projectConfig = this.createDefaultConfig('project');
                }
                return this.projectConfig;
            case 'local':
                if (!this.localConfig) {
                    this.localConfig = this.createDefaultConfig('local');
                }
                return this.localConfig;
            case 'session':
                return this.sessionConfig;
        }
    }
    createDefaultConfig(scope) {
        return {
            mode: 'default',
            rules: [],
            allowedDirectories: [],
            deniedDirectories: [],
            metadata: {
                scope,
                created: Date.now()
            }
        };
    }
    addRules(config, rules, behavior) {
        const newRules = rules.map((r, index)=>({
                ...r,
                behavior,
                scope: config.metadata?.scope || 'session',
                priority: 100 + index,
                timestamp: Date.now()
            }));
        config.rules.push(...newRules);
    }
    replaceRules(config, rules, behavior) {
        config.rules = rules.map((r, index)=>({
                ...r,
                behavior,
                scope: config.metadata?.scope || 'session',
                priority: 100 + index,
                timestamp: Date.now()
            }));
    }
    removeRules(config, rules) {
        const toRemove = new Set(rules.map((r)=>`${r.toolName}:${r.ruleContent || ''}`));
        config.rules = config.rules.filter((rule)=>{
            const key = `${rule.toolName}:${rule.ruleContent || ''}`;
            return !toRemove.has(key);
        });
    }
    generateCacheKey(query) {
        return JSON.stringify({
            tool: query.toolName,
            input: query.toolInput,
            session: query.context?.sessionId
        });
    }
}
export function createPermissionManager(options) {
    const workingDir = options?.workingDir || process.cwd();
    return new PermissionManager({
        cacheEnabled: options?.cacheEnabled,
        cacheTTL: options?.cacheTTL,
        userConfigPath: join(process.env.HOME || '~', '.claude-flow', 'permissions.json'),
        projectConfigPath: join(workingDir, '.claude-flow', 'permissions.json'),
        localConfigPath: join(workingDir, '.permissions.json')
    });
}
export const permissionManager = createPermissionManager({
    cacheEnabled: true,
    cacheTTL: 300000
});

//# sourceMappingURL=permission-manager.js.map