import { nanoid } from 'nanoid';
export class ConsensusEngine {
    database;
    algorithms = new Map();
    currentAlgorithm = null;
    pendingDecisions = new Map();
    consensusHistory = new Map();
    constructor(database){
        this.database = database;
        this.initializeAlgorithms();
    }
    initializeAlgorithms() {
        this.algorithms.set('raft', new RaftConsensus(this.database));
        this.algorithms.set('byzantine', new ByzantineConsensus(this.database));
        this.algorithms.set('gossip', new GossipConsensus(this.database));
        this.algorithms.set('proof-of-learning', new ProofOfLearningConsensus(this.database));
    }
    async setAlgorithm(type) {
        const algorithm = this.algorithms.get(type);
        if (!algorithm) {
            throw new Error(`Unknown consensus algorithm: ${type}`);
        }
        this.currentAlgorithm = algorithm;
        await algorithm.initialize();
        await this.database.store('consensus-algorithm', type, 'system');
    }
    async propose(decision) {
        if (!this.currentAlgorithm) {
            throw new Error('No consensus algorithm selected');
        }
        const fullDecision = {
            ...decision,
            id: nanoid(),
            timestamp: new Date()
        };
        this.pendingDecisions.set(fullDecision.id, fullDecision);
        await this.database.store(`decision:${fullDecision.id}`, fullDecision, 'consensus');
        const votes = await this.currentAlgorithm.propose(fullDecision);
        const consensus = await this.processVotes(fullDecision, votes);
        return fullDecision.id;
    }
    async processVotes(decision, votes) {
        const positiveVotes = votes.filter((vote)=>vote.decision);
        const totalConfidence = votes.reduce((sum, vote)=>sum + vote.confidence, 0);
        const averageConfidence = totalConfidence / votes.length;
        const weightedPositive = positiveVotes.reduce((sum, vote)=>sum + vote.confidence, 0);
        const totalWeight = votes.reduce((sum, vote)=>sum + vote.confidence, 0);
        const outcome = weightedPositive > totalWeight / 2 && averageConfidence > 0.6;
        const consensus = {
            decisionId: decision.id,
            outcome,
            votes,
            confidence: averageConfidence,
            timestamp: new Date()
        };
        this.consensusHistory.set(decision.id, consensus);
        await this.database.store(`consensus:${decision.id}`, consensus, 'consensus');
        if (outcome) {
            await this.executeConsensus(consensus);
        }
        return consensus;
    }
    async executeConsensus(consensus) {
        if (!this.currentAlgorithm) {
            throw new Error('No consensus algorithm available for execution');
        }
        const result = await this.currentAlgorithm.execute(consensus);
        await this.database.store(`result:${consensus.decisionId}`, result, 'consensus');
        this.pendingDecisions.delete(consensus.decisionId);
        return result;
    }
    async getConsensusStatus(decisionId) {
        const decision = this.pendingDecisions.get(decisionId) || await this.database.retrieve(`decision:${decisionId}`, 'consensus');
        const consensus = this.consensusHistory.get(decisionId) || await this.database.retrieve(`consensus:${decisionId}`, 'consensus');
        let status = 'pending';
        if (consensus) {
            status = consensus.outcome ? 'reached' : 'failed';
        }
        return {
            decision,
            consensus,
            status
        };
    }
    getPendingDecisions() {
        return Array.from(this.pendingDecisions.values());
    }
    getConsensusHistory() {
        return Array.from(this.consensusHistory.values());
    }
    getCurrentAlgorithm() {
        return this.currentAlgorithm?.getType() || null;
    }
    getAvailableAlgorithms() {
        return Array.from(this.algorithms.keys());
    }
}
let RaftConsensus = class RaftConsensus {
    database;
    leaderId = null;
    term = 0;
    votedFor = null;
    constructor(database){
        this.database = database;
    }
    getType() {
        return 'raft';
    }
    async initialize() {
        const state = await this.database.retrieve('raft-state', 'consensus');
        if (state) {
            this.term = state.term || 0;
            this.leaderId = state.leaderId || null;
            this.votedFor = state.votedFor || null;
        }
    }
    async propose(decision) {
        if (!this.leaderId) {
            await this.electLeader();
        }
        const votes = [];
        const agentIds = await this.getAgentIds();
        for (const agentId of agentIds){
            const vote = {
                agentId,
                decision: Math.random() > 0.2,
                confidence: 0.8 + Math.random() * 0.2,
                reasoning: `Raft consensus vote for decision ${decision.id}`
            };
            votes.push(vote);
        }
        return votes;
    }
    async execute(consensus) {
        if (!consensus.outcome) {
            return {
                success: false,
                error: 'Consensus was not reached'
            };
        }
        return {
            success: true,
            data: {
                algorithm: 'raft',
                leader: this.leaderId,
                term: this.term,
                executedAt: new Date().toISOString()
            },
            metadata: {
                consensusId: consensus.decisionId,
                votes: consensus.votes.length
            }
        };
    }
    async electLeader() {
        this.term++;
        const agentIds = await this.getAgentIds();
        this.leaderId = agentIds[0] || 'default-leader';
        this.votedFor = this.leaderId;
        await this.database.store('raft-state', {
            term: this.term,
            leaderId: this.leaderId,
            votedFor: this.votedFor
        }, 'consensus');
    }
    async getAgentIds() {
        try {
            const agentKeys = await this.database.list('agents');
            return agentKeys.map((key)=>key.replace('agent:', ''));
        } catch  {
            return [
                'agent-1',
                'agent-2',
                'agent-3'
            ];
        }
    }
};
let ByzantineConsensus = class ByzantineConsensus {
    database;
    constructor(database){
        this.database = database;
    }
    getType() {
        return 'byzantine';
    }
    async initialize() {}
    async propose(decision) {
        const votes = [];
        const agentIds = await this.getAgentIds();
        for (const agentId of agentIds){
            const isMalicious = Math.random() < 0.2;
            const vote = {
                agentId,
                decision: isMalicious ? Math.random() < 0.3 : Math.random() > 0.3,
                confidence: isMalicious ? Math.random() * 0.5 : 0.7 + Math.random() * 0.3,
                reasoning: `Byzantine consensus vote (${isMalicious ? 'malicious' : 'honest'})`
            };
            votes.push(vote);
        }
        return votes;
    }
    async execute(consensus) {
        const honestVotes = consensus.votes.filter((vote)=>vote.confidence > 0.6);
        const required = Math.floor(consensus.votes.length * 2 / 3) + 1;
        if (honestVotes.length >= required && consensus.outcome) {
            return {
                success: true,
                data: {
                    algorithm: 'byzantine',
                    honestVotes: honestVotes.length,
                    totalVotes: consensus.votes.length,
                    executedAt: new Date().toISOString()
                }
            };
        }
        return {
            success: false,
            error: 'Byzantine consensus failed - insufficient honest votes'
        };
    }
    async getAgentIds() {
        try {
            const agentKeys = await this.database.list('agents');
            return agentKeys.map((key)=>key.replace('agent:', ''));
        } catch  {
            return [
                'agent-1',
                'agent-2',
                'agent-3',
                'agent-4',
                'agent-5'
            ];
        }
    }
};
let GossipConsensus = class GossipConsensus {
    database;
    constructor(database){
        this.database = database;
    }
    getType() {
        return 'gossip';
    }
    async initialize() {}
    async propose(decision) {
        const votes = [];
        const agentIds = await this.getAgentIds();
        for (const agentId of agentIds){
            const delay = Math.random() * 1000;
            const informed = Math.random() > 0.1;
            if (informed) {
                const vote = {
                    agentId,
                    decision: Math.random() > 0.25,
                    confidence: 0.6 + Math.random() * 0.3,
                    reasoning: `Gossip consensus vote (delay: ${Math.round(delay)}ms)`
                };
                votes.push(vote);
            }
        }
        return votes;
    }
    async execute(consensus) {
        const participation = consensus.votes.length / (await this.getAgentIds()).length;
        if (consensus.outcome && participation > 0.7) {
            return {
                success: true,
                data: {
                    algorithm: 'gossip',
                    participation: participation,
                    convergenceTime: Math.random() * 5000 + 1000,
                    executedAt: new Date().toISOString()
                }
            };
        }
        return {
            success: false,
            error: 'Gossip consensus failed - insufficient participation or negative outcome'
        };
    }
    async getAgentIds() {
        try {
            const agentKeys = await this.database.list('agents');
            return agentKeys.map((key)=>key.replace('agent:', ''));
        } catch  {
            return Array.from({
                length: 8
            }, (_, i)=>`agent-${i + 1}`);
        }
    }
};
let ProofOfLearningConsensus = class ProofOfLearningConsensus {
    database;
    constructor(database){
        this.database = database;
    }
    getType() {
        return 'proof-of-learning';
    }
    async initialize() {}
    async propose(decision) {
        const votes = [];
        const agentIds = await this.getAgentIds();
        for (const agentId of agentIds){
            const performance = await this.getAgentPerformance(agentId);
            const learningScore = this.calculateLearningScore(performance);
            const vote = {
                agentId,
                decision: learningScore > 0.5 ? Math.random() > 0.2 : Math.random() > 0.6,
                confidence: learningScore,
                reasoning: `Proof of Learning vote (learning score: ${learningScore.toFixed(2)})`
            };
            votes.push(vote);
        }
        return votes;
    }
    async execute(consensus) {
        const weightedVotes = consensus.votes.reduce((sum, vote)=>{
            return sum + (vote.decision ? vote.confidence : -vote.confidence);
        }, 0);
        const totalWeight = consensus.votes.reduce((sum, vote)=>sum + vote.confidence, 0);
        const weightedOutcome = weightedVotes > 0 && weightedVotes / totalWeight > 0.6;
        if (weightedOutcome) {
            return {
                success: true,
                data: {
                    algorithm: 'proof-of-learning',
                    weightedScore: weightedVotes / totalWeight,
                    highPerformers: consensus.votes.filter((v)=>v.confidence > 0.8).length,
                    executedAt: new Date().toISOString()
                }
            };
        }
        return {
            success: false,
            error: 'Proof of Learning consensus failed - insufficient weighted support'
        };
    }
    async getAgentPerformance(agentId) {
        try {
            const agent = await this.database.retrieve(agentId, 'agents');
            return agent?.performance || {
                successRate: 0.5,
                tasksCompleted: 0
            };
        } catch  {
            return {
                successRate: 0.5,
                tasksCompleted: 0
            };
        }
    }
    calculateLearningScore(performance) {
        const successWeight = 0.7;
        const experienceWeight = 0.3;
        const successScore = performance.successRate || 0.5;
        const experienceScore = Math.min(1.0, (performance.tasksCompleted || 0) / 100);
        return successScore * successWeight + experienceScore * experienceWeight;
    }
    async getAgentIds() {
        try {
            const agentKeys = await this.database.list('agents');
            return agentKeys.map((key)=>key.replace('agent:', ''));
        } catch  {
            return Array.from({
                length: 6
            }, (_, i)=>`agent-${i + 1}`);
        }
    }
};

//# sourceMappingURL=ConsensusEngine.js.map