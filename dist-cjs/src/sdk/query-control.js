import { EventEmitter } from 'events';
import { Logger } from '../core/logger.js';
export class RealTimeQueryController extends EventEmitter {
    logger;
    controlledQueries = new Map();
    monitoringIntervals = new Map();
    commandQueue = new Map();
    options;
    constructor(options = {}){
        super();
        this.options = {
            allowPause: options.allowPause !== false,
            allowModelChange: options.allowModelChange !== false,
            allowPermissionChange: options.allowPermissionChange !== false,
            monitoringInterval: options.monitoringInterval || 1000
        };
        this.logger = new Logger({
            level: 'info',
            format: 'text',
            destination: 'console'
        }, {
            component: 'RealTimeQueryController'
        });
    }
    registerQuery(queryId, agentId, query) {
        const controlled = {
            queryId,
            agentId,
            query,
            status: 'running',
            isPaused: false,
            canControl: true,
            startTime: Date.now()
        };
        this.controlledQueries.set(queryId, controlled);
        this.startMonitoring(queryId);
        this.logger.info('Query registered for control', {
            queryId,
            agentId
        });
        this.emit('query:registered', {
            queryId,
            agentId
        });
        return controlled;
    }
    async pauseQuery(queryId, reason) {
        if (!this.options.allowPause) {
            throw new Error('Pause is not enabled in controller options');
        }
        const controlled = this.controlledQueries.get(queryId);
        if (!controlled) {
            throw new Error(`Query not found: ${queryId}`);
        }
        if (controlled.isPaused || controlled.status !== 'running') {
            this.logger.warn('Query is not in a state to be paused', {
                queryId,
                status: controlled.status,
                isPaused: controlled.isPaused
            });
            return false;
        }
        try {
            await controlled.query.interrupt();
            controlled.isPaused = true;
            controlled.status = 'paused';
            controlled.pausedAt = Date.now();
            this.logger.info('Query paused', {
                queryId,
                reason
            });
            this.emit('query:paused', {
                queryId,
                reason
            });
            return true;
        } catch (error) {
            this.logger.error('Failed to pause query', {
                queryId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
    async resumeQuery(queryId) {
        const controlled = this.controlledQueries.get(queryId);
        if (!controlled) {
            throw new Error(`Query not found: ${queryId}`);
        }
        if (!controlled.isPaused || controlled.status !== 'paused') {
            this.logger.warn('Query is not paused', {
                queryId,
                status: controlled.status
            });
            return false;
        }
        controlled.isPaused = false;
        controlled.status = 'running';
        controlled.resumedAt = Date.now();
        this.logger.info('Query resumed', {
            queryId
        });
        this.emit('query:resumed', {
            queryId
        });
        return true;
    }
    async terminateQuery(queryId, reason) {
        const controlled = this.controlledQueries.get(queryId);
        if (!controlled) {
            throw new Error(`Query not found: ${queryId}`);
        }
        if (controlled.status === 'terminated') {
            return true;
        }
        try {
            await controlled.query.interrupt();
            controlled.status = 'terminated';
            controlled.terminatedAt = Date.now();
            this.stopMonitoring(queryId);
            this.logger.info('Query terminated', {
                queryId,
                reason
            });
            this.emit('query:terminated', {
                queryId,
                reason
            });
            return true;
        } catch (error) {
            this.logger.error('Failed to terminate query', {
                queryId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
    async changeModel(queryId, model) {
        if (!this.options.allowModelChange) {
            throw new Error('Model change is not enabled in controller options');
        }
        const controlled = this.controlledQueries.get(queryId);
        if (!controlled) {
            throw new Error(`Query not found: ${queryId}`);
        }
        if (controlled.status !== 'running') {
            throw new Error('Can only change model for running queries');
        }
        try {
            await controlled.query.setModel(model);
            controlled.currentModel = model;
            this.logger.info('Model changed for query', {
                queryId,
                model
            });
            this.emit('query:modelChanged', {
                queryId,
                model
            });
            return true;
        } catch (error) {
            this.logger.error('Failed to change model', {
                queryId,
                model,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
    async changePermissionMode(queryId, mode) {
        if (!this.options.allowPermissionChange) {
            throw new Error('Permission change is not enabled in controller options');
        }
        const controlled = this.controlledQueries.get(queryId);
        if (!controlled) {
            throw new Error(`Query not found: ${queryId}`);
        }
        if (controlled.status !== 'running') {
            throw new Error('Can only change permissions for running queries');
        }
        try {
            await controlled.query.setPermissionMode(mode);
            controlled.permissionMode = mode;
            this.logger.info('Permission mode changed for query', {
                queryId,
                mode
            });
            this.emit('query:permissionChanged', {
                queryId,
                mode
            });
            return true;
        } catch (error) {
            this.logger.error('Failed to change permission mode', {
                queryId,
                mode,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
    async getSupportedModels(queryId) {
        const controlled = this.controlledQueries.get(queryId);
        if (!controlled) {
            throw new Error(`Query not found: ${queryId}`);
        }
        try {
            return await controlled.query.supportedModels();
        } catch (error) {
            this.logger.error('Failed to get supported models', {
                queryId
            });
            throw error;
        }
    }
    async executeCommand(command) {
        this.logger.debug('Executing control command', {
            command
        });
        switch(command.type){
            case 'pause':
                return this.pauseQuery(command.queryId, command.params?.reason);
            case 'resume':
                return this.resumeQuery(command.queryId);
            case 'terminate':
                return this.terminateQuery(command.queryId, command.params?.reason);
            case 'changeModel':
                if (!command.params?.model) {
                    throw new Error('Model parameter required for changeModel command');
                }
                return this.changeModel(command.queryId, command.params.model);
            case 'changePermissions':
                if (!command.params?.permissionMode) {
                    throw new Error('Permission mode required for changePermissions command');
                }
                return this.changePermissionMode(command.queryId, command.params.permissionMode);
            default:
                throw new Error(`Unknown command type: ${command.type}`);
        }
    }
    queueCommand(command) {
        const queue = this.commandQueue.get(command.queryId) || [];
        queue.push(command);
        this.commandQueue.set(command.queryId, queue);
        this.emit('command:queued', command);
    }
    async processQueuedCommands(queryId) {
        const queue = this.commandQueue.get(queryId);
        if (!queue || queue.length === 0) {
            return;
        }
        this.logger.debug('Processing queued commands', {
            queryId,
            commandCount: queue.length
        });
        while(queue.length > 0){
            const command = queue.shift();
            try {
                await this.executeCommand(command);
            } catch (error) {
                this.logger.error('Failed to execute queued command', {
                    queryId,
                    command,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
        this.commandQueue.delete(queryId);
    }
    getQueryStatus(queryId) {
        return this.controlledQueries.get(queryId);
    }
    getAllQueries() {
        return new Map(this.controlledQueries);
    }
    startMonitoring(queryId) {
        const interval = setInterval(()=>{
            const controlled = this.controlledQueries.get(queryId);
            if (!controlled) {
                this.stopMonitoring(queryId);
                return;
            }
            const update = {
                queryId,
                status: controlled.status,
                timestamp: Date.now(),
                metadata: {
                    isPaused: controlled.isPaused,
                    duration: Date.now() - controlled.startTime
                }
            };
            this.emit('query:status', update);
        }, this.options.monitoringInterval);
        this.monitoringIntervals.set(queryId, interval);
    }
    stopMonitoring(queryId) {
        const interval = this.monitoringIntervals.get(queryId);
        if (interval) {
            clearInterval(interval);
            this.monitoringIntervals.delete(queryId);
        }
    }
    unregisterQuery(queryId) {
        this.stopMonitoring(queryId);
        this.controlledQueries.delete(queryId);
        this.commandQueue.delete(queryId);
        this.logger.info('Query unregistered', {
            queryId
        });
        this.emit('query:unregistered', {
            queryId
        });
    }
    cleanup(olderThan = 3600000) {
        const cutoff = Date.now() - olderThan;
        for (const [queryId, controlled] of this.controlledQueries.entries()){
            const endTime = controlled.terminatedAt || controlled.startTime;
            if (controlled.status === 'completed' || controlled.status === 'terminated') {
                if (endTime < cutoff) {
                    this.unregisterQuery(queryId);
                }
            }
        }
    }
    shutdown() {
        for (const queryId of this.monitoringIntervals.keys()){
            this.stopMonitoring(queryId);
        }
        this.controlledQueries.clear();
        this.commandQueue.clear();
        this.logger.info('Query controller shutdown complete');
    }
}

//# sourceMappingURL=query-control.js.map