export class TopologyManager {
    database;
    currentTopology = null;
    agents = [];
    connections = [];
    constructor(database){
        this.database = database;
    }
    async configure(topologyType, agents = []) {
        this.agents = agents;
        this.currentTopology = this.createTopology(topologyType);
        const network = await this.currentTopology.configure(agents);
        this.connections = network.connections;
        await this.database.store('topology', {
            type: topologyType,
            agentCount: agents.length,
            connectionCount: network.connections.length,
            timestamp: new Date().toISOString()
        }, 'system');
        return network;
    }
    createTopology(type) {
        switch(type){
            case 'mesh':
                return new MeshTopology();
            case 'hierarchical':
                return new HierarchicalTopology();
            case 'ring':
                return new RingTopology();
            case 'star':
                return new StarTopology();
            default:
                throw new Error(`Unknown topology type: ${type}`);
        }
    }
    async addAgent(agent) {
        if (!this.currentTopology) {
            throw new Error('Topology not configured');
        }
        this.agents.push(agent);
        const network = await this.currentTopology.configure(this.agents);
        this.connections = network.connections;
        await this.database.store(`agent:${agent.id}`, agent, 'agents');
    }
    async removeAgent(agentId) {
        if (!this.currentTopology) {
            throw new Error('Topology not configured');
        }
        this.agents = this.agents.filter((agent)=>agent.id !== agentId);
        const network = await this.currentTopology.configure(this.agents);
        this.connections = network.connections;
        await this.database.delete(`agent:${agentId}`, 'agents');
    }
    async optimize() {
        if (!this.currentTopology) {
            throw new Error('Topology not configured');
        }
        const optimization = await this.currentTopology.optimize();
        for (const change of optimization.changes){
            switch(change.action){
                case 'add-connection':
                    this.connections.push(change.connection);
                    break;
                case 'remove-connection':
                    this.connections = this.connections.filter((conn)=>!(conn.from === change.connection.from && conn.to === change.connection.to));
                    break;
                case 'modify-weight':
                    const existing = this.connections.find((conn)=>conn.from === change.connection.from && conn.to === change.connection.to);
                    if (existing) {
                        existing.weight = change.connection.weight;
                    }
                    break;
            }
        }
        return optimization;
    }
    async getTopologyInfo() {
        if (!this.currentTopology) {
            throw new Error('Topology not configured');
        }
        const metrics = this.calculateMetrics();
        return {
            type: this.currentTopology.getType(),
            agents: this.agents,
            connections: this.connections,
            metrics
        };
    }
    calculateMetrics() {
        const totalAgents = this.agents.length;
        const totalConnections = this.connections.length;
        const latencies = this.connections.map((conn)=>conn.latency || 0).filter((latency)=>latency > 0);
        const averageLatency = latencies.length > 0 ? latencies.reduce((sum, lat)=>sum + lat, 0) / latencies.length : 0;
        const throughput = totalConnections > 0 ? totalAgents / totalConnections : 0;
        const activeAgents = this.agents.filter((agent)=>agent.status === 'active').length;
        const reliability = totalAgents > 0 ? activeAgents / totalAgents : 0;
        return {
            totalAgents,
            totalConnections,
            averageLatency,
            throughput,
            reliability
        };
    }
    getConnectedAgents(agentId) {
        const connectedIds = new Set();
        this.connections.forEach((conn)=>{
            if (conn.from === agentId) {
                connectedIds.add(conn.to);
            } else if (conn.to === agentId) {
                connectedIds.add(conn.from);
            }
        });
        return this.agents.filter((agent)=>connectedIds.has(agent.id));
    }
    areConnected(agentId1, agentId2) {
        return this.connections.some((conn)=>conn.from === agentId1 && conn.to === agentId2 || conn.from === agentId2 && conn.to === agentId1);
    }
}
let MeshTopology = class MeshTopology {
    getType() {
        return 'mesh';
    }
    async configure(agents) {
        const connections = [];
        for(let i = 0; i < agents.length; i++){
            for(let j = i + 1; j < agents.length; j++){
                connections.push({
                    from: agents[i].id,
                    to: agents[j].id,
                    type: 'direct',
                    weight: 1.0,
                    latency: Math.random() * 10 + 5
                });
            }
        }
        return {
            topology: 'mesh',
            agents,
            connections,
            metrics: this.calculateMetrics(agents, connections)
        };
    }
    async optimize() {
        return {
            type: 'latency',
            changes: [],
            expectedImprovement: 0
        };
    }
    getConnections() {
        return [];
    }
    calculateMetrics(agents, connections) {
        return {
            totalAgents: agents.length,
            totalConnections: connections.length,
            averageLatency: connections.reduce((sum, conn)=>sum + (conn.latency || 0), 0) / connections.length || 0,
            throughput: agents.length,
            reliability: 0.95
        };
    }
};
let HierarchicalTopology = class HierarchicalTopology {
    getType() {
        return 'hierarchical';
    }
    async configure(agents) {
        const connections = [];
        if (agents.length === 0) {
            return {
                topology: 'hierarchical',
                agents,
                connections,
                metrics: this.calculateMetrics(agents, connections)
            };
        }
        const coordinators = agents.filter((_, index)=>index % 4 === 0);
        const workers = agents.filter((_, index)=>index % 4 !== 0);
        workers.forEach((worker, index)=>{
            const coordinatorIndex = Math.floor(index / 3);
            const coordinator = coordinators[coordinatorIndex] || coordinators[0];
            connections.push({
                from: worker.id,
                to: coordinator.id,
                type: 'direct',
                weight: 1.0,
                latency: Math.random() * 5 + 2
            });
        });
        for(let i = 0; i < coordinators.length - 1; i++){
            connections.push({
                from: coordinators[i].id,
                to: coordinators[i + 1].id,
                type: 'relay',
                weight: 2.0,
                latency: Math.random() * 8 + 3
            });
        }
        return {
            topology: 'hierarchical',
            agents,
            connections,
            metrics: this.calculateMetrics(agents, connections)
        };
    }
    async optimize() {
        return {
            type: 'throughput',
            changes: [],
            expectedImprovement: 0
        };
    }
    getConnections() {
        return [];
    }
    calculateMetrics(agents, connections) {
        return {
            totalAgents: agents.length,
            totalConnections: connections.length,
            averageLatency: connections.reduce((sum, conn)=>sum + (conn.latency || 0), 0) / connections.length || 0,
            throughput: Math.sqrt(agents.length),
            reliability: 0.85
        };
    }
};
let RingTopology = class RingTopology {
    getType() {
        return 'ring';
    }
    async configure(agents) {
        const connections = [];
        if (agents.length < 2) {
            return {
                topology: 'ring',
                agents,
                connections,
                metrics: this.calculateMetrics(agents, connections)
            };
        }
        for(let i = 0; i < agents.length; i++){
            const nextIndex = (i + 1) % agents.length;
            connections.push({
                from: agents[i].id,
                to: agents[nextIndex].id,
                type: 'direct',
                weight: 1.0,
                latency: Math.random() * 6 + 3
            });
        }
        return {
            topology: 'ring',
            agents,
            connections,
            metrics: this.calculateMetrics(agents, connections)
        };
    }
    async optimize() {
        return {
            type: 'reliability',
            changes: [],
            expectedImprovement: 0
        };
    }
    getConnections() {
        return [];
    }
    calculateMetrics(agents, connections) {
        return {
            totalAgents: agents.length,
            totalConnections: connections.length,
            averageLatency: connections.reduce((sum, conn)=>sum + (conn.latency || 0), 0) / connections.length || 0,
            throughput: agents.length * 0.7,
            reliability: 0.75
        };
    }
};
let StarTopology = class StarTopology {
    getType() {
        return 'star';
    }
    async configure(agents) {
        const connections = [];
        if (agents.length === 0) {
            return {
                topology: 'star',
                agents,
                connections,
                metrics: this.calculateMetrics(agents, connections)
            };
        }
        const hub = agents[0];
        const spokes = agents.slice(1);
        spokes.forEach((spoke)=>{
            connections.push({
                from: spoke.id,
                to: hub.id,
                type: 'direct',
                weight: 1.0,
                latency: Math.random() * 4 + 2
            });
        });
        return {
            topology: 'star',
            agents,
            connections,
            metrics: this.calculateMetrics(agents, connections)
        };
    }
    async optimize() {
        return {
            type: 'latency',
            changes: [],
            expectedImprovement: 0
        };
    }
    getConnections() {
        return [];
    }
    calculateMetrics(agents, connections) {
        return {
            totalAgents: agents.length,
            totalConnections: connections.length,
            averageLatency: connections.reduce((sum, conn)=>sum + (conn.latency || 0), 0) / connections.length || 0,
            throughput: Math.min(agents.length, 10),
            reliability: 0.70
        };
    }
};

//# sourceMappingURL=TopologyManager.js.map