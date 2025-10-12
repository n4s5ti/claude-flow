import { nanoid } from 'nanoid';
export class AgentRegistry {
    database;
    agents = new Map();
    tasks = new Map();
    activeAssignments = new Map();
    constructor(database){
        this.database = database;
    }
    async initialize() {
        try {
            const agentIds = await this.database.list('agents');
            for (const agentId of agentIds){
                const agentData = await this.database.retrieve(agentId, 'agents');
                if (agentData) {
                    const agent = typeof agentData === 'string' ? JSON.parse(agentData) : agentData;
                    this.agents.set(agent.id, agent);
                }
            }
        } catch (error) {
            console.warn('Failed to load existing agents:', error);
        }
    }
    async spawn(type, config = {}) {
        const agent = {
            id: nanoid(),
            type,
            capabilities: config.capabilities || this.getDefaultCapabilities(type),
            status: 'idle',
            metadata: {
                ...config.metadata,
                spawnedAt: new Date().toISOString(),
                maxConcurrency: config.maxConcurrency || 1,
                timeout: config.timeout || 30000,
                resources: config.resources || {
                    memory: 512,
                    cpu: 1,
                    storage: 100,
                    network: 10
                }
            },
            connections: [],
            performance: {
                tasksCompleted: 0,
                averageResponseTime: 0,
                successRate: 1.0,
                resourceUtilization: {
                    memory: 0,
                    cpu: 0,
                    storage: 0,
                    network: 0
                },
                lastActivity: new Date()
            }
        };
        this.agents.set(agent.id, agent);
        await this.database.store(agent.id, agent, 'agents');
        this.activeAssignments.set(agent.id, []);
        return agent;
    }
    getDefaultCapabilities(type) {
        const capabilityMap = {
            researcher: [
                'research',
                'analysis',
                'documentation',
                'web-search'
            ],
            coder: [
                'programming',
                'debugging',
                'refactoring',
                'testing'
            ],
            analyst: [
                'data-analysis',
                'visualization',
                'reporting',
                'metrics'
            ],
            optimizer: [
                'performance-tuning',
                'resource-optimization',
                'bottleneck-analysis'
            ],
            coordinator: [
                'task-delegation',
                'workflow-management',
                'communication'
            ],
            tester: [
                'unit-testing',
                'integration-testing',
                'quality-assurance'
            ],
            reviewer: [
                'code-review',
                'security-audit',
                'compliance-check'
            ]
        };
        return capabilityMap[type] || [
            'general'
        ];
    }
    async coordinate(task) {
        const startTime = Date.now();
        try {
            const suitableAgents = this.findSuitableAgents(task);
            if (suitableAgents.length === 0) {
                return {
                    success: false,
                    error: `No suitable agents found for task ${task.id}. Required capabilities: ${task.requiredCapabilities.join(', ')}`
                };
            }
            const selectedAgent = this.selectBestAgent(suitableAgents, task);
            await this.assignTask(selectedAgent.id, task);
            const executionResult = await this.executeTask(selectedAgent, task);
            await this.updateAgentPerformance(selectedAgent.id, task, executionResult, Date.now() - startTime);
            return executionResult;
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    findSuitableAgents(task) {
        return Array.from(this.agents.values()).filter((agent)=>{
            const hasCapabilities = task.requiredCapabilities.every((cap)=>agent.capabilities.some((agentCap)=>agentCap.toLowerCase().includes(cap.toLowerCase()) || cap.toLowerCase().includes(agentCap.toLowerCase())));
            const isAvailable = agent.status === 'idle' || agent.status === 'active';
            const currentTasks = this.activeAssignments.get(agent.id)?.length || 0;
            const maxConcurrency = agent.metadata.maxConcurrency || 1;
            const canTakeTask = currentTasks < maxConcurrency;
            return hasCapabilities && isAvailable && canTakeTask;
        });
    }
    selectBestAgent(candidates, task) {
        const scored = candidates.map((agent)=>{
            let score = 0;
            score += agent.performance.successRate * 40;
            score += Math.max(0, 20 - agent.performance.averageResponseTime / 1000) * 2;
            const activeTasks = this.activeAssignments.get(agent.id)?.length || 0;
            score += Math.max(0, 10 - activeTasks) * 3;
            const exactMatches = task.requiredCapabilities.filter((cap)=>agent.capabilities.includes(cap)).length;
            score += exactMatches * 5;
            if (task.priority === 'critical' && agent.type === 'coordinator') score += 10;
            if (task.priority === 'high' && [
                'coordinator',
                'optimizer'
            ].includes(agent.type)) score += 5;
            return {
                agent,
                score
            };
        });
        scored.sort((a, b)=>b.score - a.score);
        return scored[0].agent;
    }
    async assignTask(agentId, task) {
        const agent = this.agents.get(agentId);
        if (agent) {
            agent.status = 'busy';
            await this.database.store(agentId, agent, 'agents');
        }
        const currentTasks = this.activeAssignments.get(agentId) || [];
        currentTasks.push(task.id);
        this.activeAssignments.set(agentId, currentTasks);
        this.tasks.set(task.id, task);
        await this.database.store(task.id, task, 'tasks');
    }
    async executeTask(agent, task) {
        const baseTime = 1000 + Math.random() * 2000;
        const complexityFactor = task.requiredCapabilities.length * 0.5;
        const performanceFactor = 2 - agent.performance.successRate;
        const processingTime = baseTime * complexityFactor * performanceFactor;
        await new Promise((resolve)=>setTimeout(resolve, Math.min(processingTime, 5000)));
        const successProbability = agent.performance.successRate * 0.9 + 0.1;
        const success = Math.random() < successProbability;
        if (success) {
            return {
                success: true,
                data: {
                    taskId: task.id,
                    agentId: agent.id,
                    result: `Task ${task.description} completed successfully by ${agent.type} agent`,
                    processingTime: Math.round(processingTime)
                },
                metadata: {
                    capabilities: agent.capabilities,
                    performance: agent.performance
                }
            };
        } else {
            return {
                success: false,
                error: `Task ${task.id} failed during execution by agent ${agent.id}`,
                metadata: {
                    processingTime: Math.round(processingTime)
                }
            };
        }
    }
    async updateAgentPerformance(agentId, task, result, duration) {
        const agent = this.agents.get(agentId);
        if (!agent || !agent.performance) return;
        const perf = agent.performance;
        perf.tasksCompleted++;
        const alpha = 0.1;
        perf.successRate = perf.successRate * (1 - alpha) + (result.success ? 1 : 0) * alpha;
        perf.averageResponseTime = perf.averageResponseTime * (1 - alpha) + duration * alpha;
        perf.lastActivity = new Date();
        perf.resourceUtilization = {
            memory: Math.min(100, perf.resourceUtilization.memory + Math.random() * 10),
            cpu: Math.min(100, perf.resourceUtilization.cpu + Math.random() * 15),
            storage: Math.min(100, perf.resourceUtilization.storage + Math.random() * 5),
            network: Math.min(100, perf.resourceUtilization.network + Math.random() * 8)
        };
        const currentTasks = this.activeAssignments.get(agentId) || [];
        const updatedTasks = currentTasks.filter((id)=>id !== task.id);
        this.activeAssignments.set(agentId, updatedTasks);
        agent.status = updatedTasks.length > 0 ? 'busy' : 'idle';
        await this.database.store(agentId, agent, 'agents');
    }
    async monitor() {
        const agentMetrics = Array.from(this.agents.values()).map((agent)=>({
                agentId: agent.id,
                type: agent.type,
                performance: agent.performance,
                status: agent.status
            }));
        const totalMemory = agentMetrics.reduce((sum, m)=>sum + m.performance.resourceUtilization.memory, 0);
        const totalCpu = agentMetrics.reduce((sum, m)=>sum + m.performance.resourceUtilization.cpu, 0);
        const activeConnections = Array.from(this.agents.values()).reduce((sum, agent)=>sum + (agent.connections?.length || 0), 0);
        const systemMetrics = {
            uptime: Date.now() - (this.getOldestAgent()?.metadata.spawnedAt ? new Date(this.getOldestAgent().metadata.spawnedAt).getTime() : Date.now()),
            memoryUsage: totalMemory / agentMetrics.length || 0,
            cpuUsage: totalCpu / agentMetrics.length || 0,
            networkLatency: Math.random() * 10 + 5,
            activeConnections
        };
        const totalTasks = agentMetrics.reduce((sum, m)=>sum + m.performance.tasksCompleted, 0);
        const avgSuccessRate = agentMetrics.reduce((sum, m)=>sum + m.performance.successRate, 0) / agentMetrics.length || 0;
        const avgResponseTime = agentMetrics.reduce((sum, m)=>sum + m.performance.averageResponseTime, 0) / agentMetrics.length || 0;
        const performanceMetrics = {
            throughput: totalTasks / (systemMetrics.uptime / 1000 / 60) || 0,
            latency: avgResponseTime,
            errorRate: 1 - avgSuccessRate,
            bottlenecks: this.identifyBottlenecks(agentMetrics)
        };
        return {
            agents: agentMetrics,
            system: systemMetrics,
            performance: performanceMetrics
        };
    }
    identifyBottlenecks(agentMetrics) {
        const bottlenecks = [];
        const highCpuAgents = agentMetrics.filter((m)=>m.performance.resourceUtilization.cpu > 80);
        if (highCpuAgents.length > 0) {
            bottlenecks.push(`High CPU usage: ${highCpuAgents.map((a)=>a.agentId).join(', ')}`);
        }
        const highMemoryAgents = agentMetrics.filter((m)=>m.performance.resourceUtilization.memory > 80);
        if (highMemoryAgents.length > 0) {
            bottlenecks.push(`High memory usage: ${highMemoryAgents.map((a)=>a.agentId).join(', ')}`);
        }
        const lowSuccessAgents = agentMetrics.filter((m)=>m.performance.successRate < 0.8);
        if (lowSuccessAgents.length > 0) {
            bottlenecks.push(`Low success rate: ${lowSuccessAgents.map((a)=>a.agentId).join(', ')}`);
        }
        const slowAgents = agentMetrics.filter((m)=>m.performance.averageResponseTime > 5000);
        if (slowAgents.length > 0) {
            bottlenecks.push(`Slow response time: ${slowAgents.map((a)=>a.agentId).join(', ')}`);
        }
        return bottlenecks;
    }
    async shutdown(agentId) {
        const agent = this.agents.get(agentId);
        if (!agent) return;
        const activeTasks = this.activeAssignments.get(agentId) || [];
        for (const taskId of activeTasks){
            await this.database.delete(taskId, 'tasks');
        }
        this.agents.delete(agentId);
        this.activeAssignments.delete(agentId);
        await this.database.delete(agentId, 'agents');
    }
    async getActiveAgents() {
        return Array.from(this.agents.values()).filter((agent)=>agent.status !== 'offline');
    }
    getAgent(agentId) {
        return this.agents.get(agentId);
    }
    getAgentsByType(type) {
        return Array.from(this.agents.values()).filter((agent)=>agent.type === type);
    }
    getAgentCount() {
        return this.agents.size;
    }
    getOldestAgent() {
        let oldest;
        let oldestTime = Date.now();
        for (const agent of this.agents.values()){
            const spawnTime = new Date(agent.metadata.spawnedAt).getTime();
            if (spawnTime < oldestTime) {
                oldestTime = spawnTime;
                oldest = agent;
            }
        }
        return oldest;
    }
}

//# sourceMappingURL=AgentRegistry.js.map