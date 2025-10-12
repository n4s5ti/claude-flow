import { minimatch } from 'minimatch';
export class HookMatcher {
    cache = new Map();
    cacheEnabled;
    cacheTTL;
    matchStrategy;
    constructor(config){
        this.cacheEnabled = config?.cacheEnabled ?? true;
        this.cacheTTL = config?.cacheTTL ?? 60000;
        this.matchStrategy = config?.matchStrategy ?? 'all';
    }
    async match(hook, context, payload) {
        const startTime = Date.now();
        const cacheKey = this.generateCacheKey(hook, context, payload);
        if (this.cacheEnabled) {
            const cached = this.cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
                return {
                    matched: cached.result,
                    matchedRules: cached.rules,
                    executionTime: Date.now() - startTime,
                    cacheHit: true
                };
            }
        }
        const rules = this.extractRules(hook.filter);
        if (rules.length === 0) {
            return {
                matched: true,
                matchedRules: [
                    '*'
                ],
                executionTime: Date.now() - startTime,
                cacheHit: false
            };
        }
        const matchedRules = [];
        const results = [];
        for (const rule of rules){
            const ruleResult = await this.evaluateRule(rule, context, payload);
            results.push(ruleResult);
            if (ruleResult) {
                matchedRules.push(this.getRuleName(rule));
            }
        }
        const matched = this.matchStrategy === 'all' ? results.every((r)=>r) : results.some((r)=>r);
        if (this.cacheEnabled) {
            this.cache.set(cacheKey, {
                result: matched,
                timestamp: Date.now(),
                rules: matchedRules
            });
        }
        return {
            matched,
            matchedRules,
            executionTime: Date.now() - startTime,
            cacheHit: false
        };
    }
    matchFilePath(filePath, patterns) {
        for (const pattern of patterns){
            const matched = this.matchFilePattern(filePath, pattern);
            if (pattern.inverted ? !matched : matched) {
                return true;
            }
        }
        return false;
    }
    matchAgentType(agentType, matcher) {
        if (matcher.exclude && matcher.exclude.includes(agentType)) {
            return false;
        }
        return matcher.agentTypes.includes(agentType) || matcher.agentTypes.includes('*');
    }
    matchOperation(operation, matcher) {
        if (matcher.exclude && matcher.exclude.includes(operation)) {
            return false;
        }
        return matcher.operations.includes(operation) || matcher.operations.includes('*');
    }
    clearCache() {
        this.cache.clear();
    }
    getCacheStats() {
        return {
            size: this.cache.size,
            hitRate: 0
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
    extractRules(filter) {
        if (!filter) return [];
        const rules = [];
        if (filter.patterns) {
            rules.push({
                type: 'file',
                patterns: filter.patterns.map((p)=>({
                        type: 'regex',
                        pattern: p
                    }))
            });
        }
        if (filter.operations) {
            rules.push({
                type: 'operation',
                operations: filter.operations
            });
        }
        if (filter.conditions) {
            rules.push({
                type: 'context',
                conditions: filter.conditions
            });
        }
        return rules;
    }
    async evaluateRule(rule, context, payload) {
        switch(rule.type){
            case 'file':
                return this.evaluateFileRule(rule, payload);
            case 'agent':
                return this.evaluateAgentRule(rule, context);
            case 'operation':
                return this.evaluateOperationRule(rule, payload);
            case 'context':
                return this.evaluateContextRule(rule, context);
            case 'composite':
                return this.evaluateCompositeRule(rule, context, payload);
            default:
                return false;
        }
    }
    evaluateFileRule(rule, payload) {
        const filePath = payload?.file || payload?.filePath || payload?.path;
        if (!filePath) return false;
        return this.matchFilePath(filePath, rule.patterns);
    }
    evaluateAgentRule(rule, context) {
        const agentType = context.metadata?.agentType || context.metadata?.agent;
        if (!agentType) return false;
        return this.matchAgentType(agentType, rule);
    }
    evaluateOperationRule(rule, payload) {
        const operation = payload?.operation || payload?.type || payload?.action;
        if (!operation) return false;
        return this.matchOperation(operation, rule);
    }
    evaluateContextRule(rule, context) {
        for (const condition of rule.conditions){
            const value = this.getNestedValue(context, condition.field);
            if (!this.evaluateCondition(value, condition.operator, condition.value)) {
                return false;
            }
        }
        return true;
    }
    async evaluateCompositeRule(rule, context, payload) {
        const results = await Promise.all(rule.patterns.map((p)=>this.evaluateRule(p, context, payload)));
        return rule.operator === 'AND' ? results.every((r)=>r) : results.some((r)=>r);
    }
    matchFilePattern(filePath, pattern) {
        switch(pattern.type){
            case 'glob':
                return minimatch(filePath, pattern.pattern, {
                    dot: true
                });
            case 'regex':
                return pattern.pattern.test(filePath);
            case 'exact':
                return filePath === pattern.pattern;
            default:
                return false;
        }
    }
    evaluateCondition(value, operator, expected) {
        switch(operator){
            case 'eq':
                return value === expected;
            case 'ne':
                return value !== expected;
            case 'gt':
                return value > expected;
            case 'lt':
                return value < expected;
            case 'gte':
                return value >= expected;
            case 'lte':
                return value <= expected;
            case 'in':
                return Array.isArray(expected) && expected.includes(value);
            case 'nin':
                return Array.isArray(expected) && !expected.includes(value);
            case 'regex':
                return new RegExp(expected).test(String(value));
            case 'contains':
                return String(value).includes(String(expected));
            default:
                return false;
        }
    }
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key)=>current?.[key], obj);
    }
    generateCacheKey(hook, context, payload) {
        const parts = [
            hook.id,
            context.sessionId,
            JSON.stringify(payload)
        ];
        return parts.join(':');
    }
    getRuleName(rule) {
        switch(rule.type){
            case 'file':
                return `file:${rule.patterns.length} patterns`;
            case 'agent':
                return `agent:${rule.agentTypes.join(',')}`;
            case 'operation':
                return `operation:${rule.operations.join(',')}`;
            case 'context':
                return `context:${rule.conditions.length} conditions`;
            case 'composite':
                return `composite:${rule.operator}`;
            default:
                return 'unknown';
        }
    }
}
export function createFilePathMatcher(patterns, options) {
    return {
        type: 'file',
        patterns: patterns.map((p)=>({
                type: p.includes('*') ? 'glob' : 'exact',
                pattern: p,
                inverted: options?.inverted
            })),
        ignoreCase: options?.ignoreCase
    };
}
export function createAgentTypeMatcher(agentTypes, exclude) {
    return {
        type: 'agent',
        agentTypes,
        exclude
    };
}
export function createOperationMatcher(operations, exclude) {
    return {
        type: 'operation',
        operations,
        exclude
    };
}
export function createContextMatcher(conditions) {
    return {
        type: 'context',
        conditions
    };
}
export function createCompositePattern(operator, patterns) {
    return {
        type: 'composite',
        operator,
        patterns
    };
}
export const hookMatcher = new HookMatcher({
    cacheEnabled: true,
    cacheTTL: 60000,
    matchStrategy: 'all'
});

//# sourceMappingURL=hook-matchers.js.map