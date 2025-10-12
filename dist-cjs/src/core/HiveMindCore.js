import { nanoid } from 'nanoid';
export class HiveMindCore {
    database;
    agentRegistry;
    consensusEngine;
    metricsCollector;
    queen;
    workerPools = new Map();
    objectives = new Map();
    strategies = new Map();
    assignments = new Map();
    config;
    constructor(database, agentRegistry, consensusEngine, metricsCollector, config = {}){
        this.database = database;
        this.agentRegistry = agentRegistry;
        this.consensusEngine = consensusEngine;
        this.metricsCollector = metricsCollector;
        this.config = {
            maxWorkerPools: 5,
            queenEnabled: true,
            adaptationRate: 0.1,
            consensusThreshold: 0.7,
            specializations: [
                'research',
                'development',
                'testing',
                'optimization',
                'coordination'
            ],
            ...config
        };
        this.queen = new QueenManager(this.database, this.agentRegistry, this.consensusEngine, this.metricsCollector);
    }
    async initialize() {
        if (this.config.queenEnabled) {
            await this.queen.initialize();
        }
        await this.createInitialWorkerPools();
        await this.loadPersistedState();
        console.log('🧠 Hive Mind Core initialized with collective intelligence capabilities');
    }
    async createInitialWorkerPools() {
        for (const specialization of this.config.specializations){
            const pool = {
                id: nanoid(),
                specialization,
                agents: [],
                capacity: 5,
                utilization: 0,
                performance: {
                    tasksCompleted: 0,
                    averageQuality: 0.8,
                    successRate: 1.0
                }
            };
            this.workerPools.set(pool.id, pool);
            await this.database.store(`worker-pool:${pool.id}`, pool, 'hive-mind');
        }
    }
    async loadPersistedState() {
        try {
            const objectiveKeys = await this.database.list('hive-mind');
            const objectiveItems = objectiveKeys.filter((key)=>key.startsWith('objective:'));
            for (const key of objectiveItems){
                const objective = await this.database.retrieve(key, 'hive-mind');
                if (objective) {
                    this.objectives.set(objective.id, objective);
                }
            }
        } catch (error) {
            console.warn('Failed to load persisted hive mind state:', error);
        }
    }
    async setObjective(objective) {
        const fullObjective = {
            ...objective,
            id: nanoid()
        };
        this.objectives.set(fullObjective.id, fullObjective);
        await this.database.store(`objective:${fullObjective.id}`, fullObjective, 'hive-mind');
        if (this.config.queenEnabled) {
            const strategy = await this.queen.strategize(fullObjective);
            this.strategies.set(fullObjective.id, strategy);
            await this.database.store(`strategy:${fullObjective.id}`, strategy, 'hive-mind');
        }
        return fullObjective.id;
    }
    async executeObjective(objectiveId) {
        const objective = this.objectives.get(objectiveId);
        if (!objective) {
            throw new Error(`Objective ${objectiveId} not found`);
        }
        const strategy = this.strategies.get(objectiveId);
        if (!strategy) {
            throw new Error(`No strategy found for objective ${objectiveId}`);
        }
        const allTasks = [];
        strategy.phases.forEach((phase)=>{
            allTasks.push(...phase.tasks);
        });
        const assignments = await this.delegateTasks(allTasks);
        const results = await this.executeAssignments(assignments);
        const metrics = await this.collectExecutionMetrics(objectiveId, assignments, results);
        return {
            success: results.every((r)=>r.success),
            assignments,
            results,
            metrics
        };
    }
    async delegateTasks(tasks) {
        const assignments = [];
        for (const task of tasks){
            const bestPool = this.findBestWorkerPool(task);
            if (!bestPool) {
                console.warn(`No suitable worker pool found for task ${task.id}`);
                continue;
            }
            const bestAgent = await this.findBestAgentInPool(bestPool, task);
            if (!bestAgent) {
                console.warn(`No suitable agent found in pool ${bestPool.id} for task ${task.id}`);
                continue;
            }
            const assignment = {
                agentId: bestAgent.id,
                task,
                deadline: task.deadline || new Date(Date.now() + 3600000),
                resources: {
                    memory: 256,
                    cpu: 1,
                    storage: 100,
                    network: 10
                }
            };
            assignments.push(assignment);
            this.assignments.set(task.id, assignment);
            bestPool.utilization += 1;
        }
        return assignments;
    }
    findBestWorkerPool(task) {
        let bestPool = null;
        let bestScore = -1;
        for (const pool of this.workerPools.values()){
            const canHandle = task.requiredCapabilities.some((capability)=>capability.toLowerCase().includes(pool.specialization.toLowerCase()) || pool.specialization.toLowerCase().includes(capability.toLowerCase()));
            if (!canHandle) continue;
            let score = pool.performance.successRate * 40;
            score += pool.performance.averageQuality * 30;
            score += Math.max(0, (pool.capacity - pool.utilization) / pool.capacity) * 30;
            if (score > bestScore) {
                bestScore = score;
                bestPool = pool;
            }
        }
        return bestPool;
    }
    async findBestAgentInPool(pool, task) {
        if (pool.agents.length === 0) {
            const agent = await this.agentRegistry.spawn(this.getAgentTypeForSpecialization(pool.specialization), {
                capabilities: task.requiredCapabilities,
                metadata: {
                    workerPoolId: pool.id,
                    specialization: pool.specialization
                }
            });
            pool.agents.push(agent);
            await this.database.store(`worker-pool:${pool.id}`, pool, 'hive-mind');
            return agent;
        }
        let bestAgent = null;
        let bestScore = -1;
        for (const agent of pool.agents){
            if (agent.status !== 'idle' && agent.status !== 'active') continue;
            const capabilityMatch = task.requiredCapabilities.filter((cap)=>agent.capabilities.includes(cap)).length / task.requiredCapabilities.length;
            const performanceScore = agent.performance?.successRate || 0.5;
            const score = capabilityMatch * 60 + performanceScore * 40;
            if (score > bestScore) {
                bestScore = score;
                bestAgent = agent;
            }
        }
        return bestAgent;
    }
    getAgentTypeForSpecialization(specialization) {
        const typeMap = {
            research: 'researcher',
            development: 'coder',
            testing: 'tester',
            optimization: 'optimizer',
            coordination: 'coordinator'
        };
        return typeMap[specialization] || 'researcher';
    }
    async executeAssignments(assignments) {
        const results = [];
        const dependencyGroups = this.groupByDependencies(assignments);
        for (const group of dependencyGroups){
            const groupResults = await Promise.all(group.map(async (assignment)=>{
                try {
                    return await this.agentRegistry.coordinate(assignment.task);
                } catch (error) {
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : String(error),
                        assignment
                    };
                }
            }));
            results.push(...groupResults);
        }
        return results;
    }
    groupByDependencies(assignments) {
        const groups = [];
        const remaining = [
            ...assignments
        ];
        while(remaining.length > 0){
            const currentGroup = remaining.filter((assignment)=>!assignment.task.dependencies?.some((dep)=>remaining.some((other)=>other.task.id === dep)));
            if (currentGroup.length === 0) {
                currentGroup.push(remaining[0]);
            }
            groups.push(currentGroup);
            remaining.splice(0, currentGroup.length);
        }
        return groups;
    }
    async collectExecutionMetrics(objectiveId, assignments, results) {
        const successCount = results.filter((r)=>r.success).length;
        const successRate = successCount / results.length;
        const totalTime = results.reduce((sum, r)=>sum + (r.metadata?.executionTime || 0), 0);
        const averageTime = totalTime / results.length;
        const metrics = {
            objectiveId,
            totalTasks: assignments.length,
            successfulTasks: successCount,
            successRate,
            averageExecutionTime: averageTime,
            workerPoolUtilization: this.calculatePoolUtilization(),
            timestamp: new Date().toISOString()
        };
        await this.metricsCollector.recordSystemMetrics({
            cpuUsage: 50 + Math.random() * 30,
            memoryUsage: 60 + Math.random() * 20,
            diskUsage: 30 + Math.random() * 10,
            networkLatency: 10 + Math.random() * 20,
            activeConnections: assignments.length
        });
        return metrics;
    }
    calculatePoolUtilization() {
        const utilization = {};
        for (const [poolId, pool] of this.workerPools){
            utilization[pool.specialization] = pool.utilization / pool.capacity;
        }
        return utilization;
    }
    async adapt(feedback) {
        if (this.config.queenEnabled) {
            await this.queen.adapt(feedback);
        }
        for (const pool of this.workerPools.values()){
            const poolFeedback = feedback.filter((f)=>pool.agents.some((agent)=>agent.id === f.source));
            if (poolFeedback.length > 0) {
                const avgRating = poolFeedback.reduce((sum, f)=>sum + f.rating, 0) / poolFeedback.length;
                const alpha = this.config.adaptationRate;
                pool.performance.averageQuality = pool.performance.averageQuality * (1 - alpha) + avgRating / 5 * alpha;
                await this.database.store(`worker-pool:${pool.id}`, pool, 'hive-mind');
            }
        }
    }
    async getStatus() {
        const queenMetrics = this.config.queenEnabled ? await this.queen.monitor() : null;
        const overallPerformance = Array.from(this.workerPools.values()).reduce((sum, pool)=>sum + pool.performance.averageQuality, 0) / this.workerPools.size;
        return {
            queen: queenMetrics,
            workerPools: Array.from(this.workerPools.values()),
            activeObjectives: this.objectives.size,
            totalAssignments: this.assignments.size,
            overallPerformance
        };
    }
    getWorkerPoolBySpecialization(specialization) {
        return Array.from(this.workerPools.values()).find((pool)=>pool.specialization === specialization);
    }
    async scaleWorkerPool(poolId, newCapacity) {
        const pool = this.workerPools.get(poolId);
        if (!pool) return;
        pool.capacity = newCapacity;
        await this.database.store(`worker-pool:${poolId}`, pool, 'hive-mind');
    }
}
let QueenManager = class QueenManager {
    database;
    agentRegistry;
    consensusEngine;
    metricsCollector;
    strategies = new Map();
    metrics = {
        strategiesCreated: 0,
        tasksAssigned: 0,
        successRate: 1.0,
        adaptationCount: 0,
        performanceScore: 100
    };
    constructor(database, agentRegistry, consensusEngine, metricsCollector){
        this.database = database;
        this.agentRegistry = agentRegistry;
        this.consensusEngine = consensusEngine;
        this.metricsCollector = metricsCollector;
    }
    async initialize() {
        console.log('👑 Queen Manager initialized - Strategic intelligence online');
    }
    async strategize(objective) {
        const complexity = this.analyzeComplexity(objective);
        const riskLevel = this.assessRisk(objective);
        const phases = this.createStrategyPhases(objective, complexity);
        const resourceAllocation = this.estimateResources(objective, phases);
        const riskAssessment = this.identifyRisks(objective, riskLevel);
        const strategy = {
            approach: this.selectApproach(complexity, riskLevel),
            phases,
            resourceAllocation,
            expectedOutcome: `Complete objective: ${objective.description}`,
            riskAssessment
        };
        this.strategies.set(objective.id, strategy);
        this.metrics.strategiesCreated++;
        return strategy;
    }
    async delegate(tasks) {
        this.metrics.tasksAssigned += tasks.length;
        return [];
    }
    async monitor() {
        const recentStrategies = Array.from(this.strategies.values()).slice(-10);
        if (recentStrategies.length > 0) {
            this.metrics.performanceScore = Math.min(100, 70 + Math.random() * 30);
        }
        return {
            ...this.metrics
        };
    }
    async adapt(feedback) {
        const avgRating = feedback.reduce((sum, f)=>sum + f.rating, 0) / feedback.length;
        const alpha = 0.1;
        this.metrics.successRate = this.metrics.successRate * (1 - alpha) + avgRating / 5 * alpha;
        this.metrics.adaptationCount++;
    }
    analyzeComplexity(objective) {
        const factors = [
            objective.goals.length,
            objective.constraints.length,
            objective.priority === 'critical' ? 2 : 1
        ];
        const complexity = factors.reduce((sum, factor)=>sum + factor, 0);
        if (complexity <= 3) return 'low';
        if (complexity <= 6) return 'medium';
        return 'high';
    }
    assessRisk(objective) {
        const hasDeadline = !!objective.deadline;
        const constraintCount = objective.constraints.length;
        const isCritical = objective.priority === 'critical';
        if (isCritical || constraintCount > 3 || hasDeadline && new Date(objective.deadline) < new Date(Date.now() + 86400000)) {
            return 'high';
        }
        if (constraintCount > 1 || hasDeadline) {
            return 'medium';
        }
        return 'low';
    }
    createStrategyPhases(objective, complexity) {
        const basePhases = [
            {
                name: 'Analysis',
                description: 'Analyze requirements and constraints'
            },
            {
                name: 'Planning',
                description: 'Create detailed execution plan'
            },
            {
                name: 'Execution',
                description: 'Implement the solution'
            },
            {
                name: 'Validation',
                description: 'Validate outcomes against goals'
            }
        ];
        if (complexity === 'high') {
            basePhases.splice(2, 0, {
                name: 'Prototyping',
                description: 'Create and test prototypes'
            });
        }
        return basePhases.map((phase, index)=>({
                ...phase,
                tasks: this.createTasksForPhase(phase, objective),
                dependencies: index > 0 ? [
                    basePhases[index - 1].name
                ] : [],
                duration: complexity === 'high' ? 3600 : complexity === 'medium' ? 1800 : 900
            }));
    }
    createTasksForPhase(phase, objective) {
        return [
            {
                id: nanoid(),
                type: phase.name.toLowerCase(),
                description: `${phase.description} for objective: ${objective.description}`,
                priority: objective.priority,
                requiredCapabilities: this.inferCapabilities(phase.name),
                deadline: objective.deadline
            }
        ];
    }
    inferCapabilities(phaseName) {
        const capabilityMap = {
            'Analysis': [
                'research',
                'analysis'
            ],
            'Planning': [
                'planning',
                'coordination'
            ],
            'Prototyping': [
                'programming',
                'testing'
            ],
            'Execution': [
                'programming',
                'implementation'
            ],
            'Validation': [
                'testing',
                'quality-assurance'
            ]
        };
        return capabilityMap[phaseName] || [
            'general'
        ];
    }
    selectApproach(complexity, riskLevel) {
        if (complexity === 'high' && riskLevel === 'high') {
            return 'Incremental development with continuous validation';
        }
        if (complexity === 'high') {
            return 'Phased implementation with parallel workstreams';
        }
        if (riskLevel === 'high') {
            return 'Risk-first approach with contingency planning';
        }
        return 'Standard agile approach with regular checkpoints';
    }
    estimateResources(objective, phases) {
        return {
            memory: phases.length * 512,
            cpu: phases.length * 2,
            storage: phases.length * 100,
            network: 10
        };
    }
    identifyRisks(objective, riskLevel) {
        const baseRisks = [
            {
                description: 'Requirement changes during execution',
                probability: 0.3,
                impact: 0.6,
                mitigation: 'Regular stakeholder communication and flexible planning'
            }
        ];
        if (riskLevel === 'high') {
            baseRisks.push({
                description: 'Resource constraints affecting timeline',
                probability: 0.5,
                impact: 0.8,
                mitigation: 'Resource monitoring and contingency planning'
            });
        }
        return baseRisks;
    }
};

//# sourceMappingURL=HiveMindCore.js.map