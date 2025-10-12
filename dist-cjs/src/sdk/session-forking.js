import { query } from '@anthropic-ai/claude-code';
import { EventEmitter } from 'events';
import { Logger } from '../core/logger.js';
import { generateId } from '../utils/helpers.js';
export class ParallelSwarmExecutor extends EventEmitter {
    logger;
    activeSessions = new Map();
    sessionHistory = new Map();
    executionMetrics;
    constructor(){
        super();
        this.logger = new Logger({
            level: 'info',
            format: 'text',
            destination: 'console'
        }, {
            component: 'ParallelSwarmExecutor'
        });
        this.executionMetrics = {
            totalAgentsSpawned: 0,
            parallelExecutions: 0,
            avgSpawnTime: 0,
            performanceGain: 1.0
        };
    }
    async spawnParallelAgents(agentConfigs, options = {}) {
        const startTime = Date.now();
        const executionId = generateId('parallel-exec');
        this.logger.info('Starting parallel agent spawning', {
            executionId,
            agentCount: agentConfigs.length,
            forkingEnabled: true
        });
        const sortedConfigs = this.sortByPriority(agentConfigs);
        const maxParallel = options.maxParallelAgents || 10;
        const batches = this.createBatches(sortedConfigs, maxParallel);
        const agentResults = new Map();
        const failedAgents = [];
        const successfulAgents = [];
        for (const batch of batches){
            const batchPromises = batch.map((config)=>this.spawnSingleAgent(config, options, executionId));
            const batchResults = await Promise.allSettled(batchPromises);
            batchResults.forEach((result, index)=>{
                const config = batch[index];
                if (result.status === 'fulfilled') {
                    agentResults.set(config.agentId, result.value);
                    successfulAgents.push(config.agentId);
                } else {
                    failedAgents.push(config.agentId);
                    agentResults.set(config.agentId, {
                        agentId: config.agentId,
                        output: '',
                        messages: [],
                        duration: Date.now() - startTime,
                        status: 'failed',
                        error: result.reason
                    });
                }
            });
        }
        const totalDuration = Date.now() - startTime;
        this.updateMetrics(agentConfigs.length, totalDuration);
        const result = {
            success: failedAgents.length === 0,
            agentResults,
            totalDuration,
            failedAgents,
            successfulAgents
        };
        this.logger.info('Parallel agent spawning completed', {
            executionId,
            totalAgents: agentConfigs.length,
            successful: successfulAgents.length,
            failed: failedAgents.length,
            duration: totalDuration,
            performanceGain: this.executionMetrics.performanceGain
        });
        this.emit('parallel:complete', result);
        return result;
    }
    async spawnSingleAgent(config, options, executionId) {
        const sessionId = generateId('fork-session');
        const startTime = Date.now();
        this.logger.debug('Spawning forked session', {
            sessionId,
            agentId: config.agentId,
            agentType: config.agentType
        });
        try {
            const sdkOptions = {
                forkSession: true,
                resume: options.baseSessionId,
                resumeSessionAt: options.resumeFromMessage,
                model: options.model || 'claude-sonnet-4',
                maxTurns: 50,
                timeout: config.timeout || options.timeout || 60000,
                mcpServers: options.mcpServers || {},
                cwd: process.cwd()
            };
            const prompt = this.buildAgentPrompt(config);
            const forkedQuery = query({
                prompt,
                options: sdkOptions
            });
            const forkedSession = {
                sessionId,
                agentId: config.agentId,
                agentType: config.agentType,
                query: forkedQuery,
                messages: [],
                status: 'spawning',
                startTime
            };
            this.activeSessions.set(sessionId, forkedSession);
            this.emit('session:forked', {
                sessionId,
                agentId: config.agentId
            });
            const messages = [];
            let outputText = '';
            for await (const message of forkedQuery){
                messages.push(message);
                forkedSession.messages.push(message);
                if (message.type === 'assistant') {
                    const textContent = message.message.content.filter((c)=>c.type === 'text').map((c)=>c.text).join('\n');
                    outputText += textContent;
                }
                forkedSession.status = 'active';
                this.emit('session:message', {
                    sessionId,
                    message
                });
            }
            forkedSession.status = 'completed';
            forkedSession.endTime = Date.now();
            this.sessionHistory.set(sessionId, messages);
            const duration = Date.now() - startTime;
            this.logger.debug('Forked session completed', {
                sessionId,
                agentId: config.agentId,
                duration,
                messageCount: messages.length
            });
            return {
                agentId: config.agentId,
                output: outputText,
                messages,
                duration,
                status: 'completed'
            };
        } catch (error) {
            this.logger.error('Forked session failed', {
                sessionId,
                agentId: config.agentId,
                error: error instanceof Error ? error.message : String(error)
            });
            const session = this.activeSessions.get(sessionId);
            if (session) {
                session.status = 'failed';
                session.error = error;
                session.endTime = Date.now();
            }
            throw error;
        }
    }
    buildAgentPrompt(config) {
        const sections = [];
        sections.push(`You are ${config.agentType} agent (ID: ${config.agentId}).`);
        sections.push('');
        if (config.capabilities && config.capabilities.length > 0) {
            sections.push('Your capabilities:');
            config.capabilities.forEach((cap)=>sections.push(`- ${cap}`));
            sections.push('');
        }
        sections.push('Your task:');
        sections.push(config.task);
        sections.push('');
        sections.push('Execute this task efficiently and report your results clearly.');
        return sections.join('\n');
    }
    sortByPriority(configs) {
        const priorityOrder = {
            critical: 0,
            high: 1,
            medium: 2,
            low: 3
        };
        return [
            ...configs
        ].sort((a, b)=>{
            const aPriority = priorityOrder[a.priority || 'medium'];
            const bPriority = priorityOrder[b.priority || 'medium'];
            return aPriority - bPriority;
        });
    }
    createBatches(items, batchSize) {
        const batches = [];
        for(let i = 0; i < items.length; i += batchSize){
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }
    updateMetrics(agentCount, duration) {
        this.executionMetrics.totalAgentsSpawned += agentCount;
        this.executionMetrics.parallelExecutions += 1;
        const avgSpawnTime = duration / agentCount;
        this.executionMetrics.avgSpawnTime = (this.executionMetrics.avgSpawnTime + avgSpawnTime) / 2;
        const estimatedSequentialTime = agentCount * 750;
        this.executionMetrics.performanceGain = estimatedSequentialTime / duration;
    }
    getActiveSessions() {
        return new Map(this.activeSessions);
    }
    getSessionHistory(sessionId) {
        return this.sessionHistory.get(sessionId);
    }
    getMetrics() {
        return {
            ...this.executionMetrics
        };
    }
    cleanupSessions(olderThan = 3600000) {
        const cutoff = Date.now() - olderThan;
        for (const [sessionId, session] of this.activeSessions.entries()){
            if (session.endTime && session.endTime < cutoff) {
                this.activeSessions.delete(sessionId);
                this.sessionHistory.delete(sessionId);
            }
        }
    }
}

//# sourceMappingURL=session-forking.js.map