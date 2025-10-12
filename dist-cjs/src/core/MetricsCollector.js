export class MetricsCollector {
    database;
    metricsBuffer = new Map();
    initialized = false;
    constructor(database){
        this.database = database;
    }
    async initialize() {
        await this.setupMetricsStorage();
        this.initialized = true;
    }
    async setupMetricsStorage() {
        const namespaces = [
            'initialization',
            'system',
            'performance',
            'agents',
            'consensus',
            'topology',
            'benchmarks'
        ];
        for (const namespace of namespaces){
            try {
                await this.database.store(`metrics-${namespace}-init`, {
                    initialized: true,
                    timestamp: new Date().toISOString()
                }, 'metrics');
            } catch (error) {
                console.warn(`Failed to initialize metrics namespace ${namespace}:`, error);
            }
        }
    }
    async recordInitialization(metrics) {
        const key = `init-${Date.now()}`;
        await this.database.store(key, metrics, 'metrics');
        await this.updateAggregatedMetrics('initialization', metrics);
    }
    async recordSystemMetrics(metrics) {
        const timestampedMetrics = {
            ...metrics,
            timestamp: metrics.timestamp || new Date()
        };
        const key = `system-${Date.now()}`;
        await this.database.store(key, timestampedMetrics, 'metrics');
        this.addToBuffer('system', timestampedMetrics);
    }
    async recordAgentMetrics(agentId, metrics) {
        const timestampedMetrics = {
            agentId,
            ...metrics,
            timestamp: metrics.timestamp || new Date()
        };
        const key = `agent-${agentId}-${Date.now()}`;
        await this.database.store(key, timestampedMetrics, 'metrics');
        this.addToBuffer('agents', timestampedMetrics);
    }
    async recordConsensusMetrics(metrics) {
        const timestampedMetrics = {
            ...metrics,
            timestamp: metrics.timestamp || new Date()
        };
        const key = `consensus-${metrics.decisionId}`;
        await this.database.store(key, timestampedMetrics, 'metrics');
        this.addToBuffer('consensus', timestampedMetrics);
    }
    async recordTopologyMetrics(metrics) {
        const timestampedMetrics = {
            ...metrics,
            timestamp: metrics.timestamp || new Date()
        };
        const key = `topology-${Date.now()}`;
        await this.database.store(key, timestampedMetrics, 'metrics');
        this.addToBuffer('topology', timestampedMetrics);
    }
    async recordBenchmark(benchmark) {
        const key = `benchmark-${benchmark.name}-${Date.now()}`;
        await this.database.store(key, benchmark, 'metrics');
        this.addToBuffer('benchmarks', benchmark);
    }
    async getInitializationMetrics() {
        const keys = await this.database.list('metrics');
        const initKeys = keys.filter((key)=>key.startsWith('init-'));
        const metrics = [];
        for (const key of initKeys){
            const metric = await this.database.retrieve(key, 'metrics');
            if (metric) metrics.push(metric);
        }
        metrics.sort((a, b)=>new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const total = metrics.length;
        const successful = metrics.filter((m)=>m.success).length;
        const failed = total - successful;
        const durations = metrics.map((m)=>m.duration).filter((d)=>d > 0);
        const averageDuration = durations.length > 0 ? durations.reduce((sum, d)=>sum + d, 0) / durations.length : 0;
        const modeDistribution = {};
        metrics.forEach((m)=>{
            modeDistribution[m.mode] = (modeDistribution[m.mode] || 0) + 1;
        });
        return {
            total,
            successful,
            failed,
            averageDuration,
            modeDistribution,
            recentMetrics: metrics.slice(0, 10)
        };
    }
    async getSystemHealth() {
        const systemMetrics = this.getBufferedMetrics('system', 10);
        if (systemMetrics.length === 0) {
            return {
                status: 'critical',
                score: 0,
                issues: [
                    'No system metrics available'
                ],
                recommendations: [
                    'Ensure metrics collection is working'
                ]
            };
        }
        const latest = systemMetrics[systemMetrics.length - 1];
        const issues = [];
        const recommendations = [];
        let score = 100;
        if (latest.cpuUsage > 90) {
            issues.push('High CPU usage');
            recommendations.push('Consider scaling or optimizing CPU-intensive tasks');
            score -= 30;
        } else if (latest.cpuUsage > 70) {
            issues.push('Elevated CPU usage');
            score -= 15;
        }
        if (latest.memoryUsage > 90) {
            issues.push('High memory usage');
            recommendations.push('Check for memory leaks or increase available memory');
            score -= 25;
        } else if (latest.memoryUsage > 70) {
            issues.push('Elevated memory usage');
            score -= 10;
        }
        if (latest.networkLatency > 100) {
            issues.push('High network latency');
            recommendations.push('Check network connectivity and optimize communication');
            score -= 20;
        }
        if (systemMetrics.length >= 5) {
            const recent = systemMetrics.slice(-3);
            const older = systemMetrics.slice(-6, -3);
            const recentAvgCpu = recent.reduce((sum, m)=>sum + m.cpuUsage, 0) / recent.length;
            const olderAvgCpu = older.reduce((sum, m)=>sum + m.cpuUsage, 0) / older.length;
            if (recentAvgCpu > olderAvgCpu * 1.2) {
                issues.push('CPU usage trending upward');
                score -= 10;
            }
        }
        let status;
        if (score >= 80) status = 'healthy';
        else if (score >= 50) status = 'degraded';
        else status = 'critical';
        return {
            status,
            score,
            issues,
            recommendations
        };
    }
    async getPerformanceTrends(period = '1h') {
        const trends = [];
        const metricTypes = [
            'system',
            'agents',
            'consensus',
            'topology'
        ];
        for (const type of metricTypes){
            const metrics = this.getBufferedMetrics(type, 20);
            if (metrics.length < 2) continue;
            const recent = metrics.slice(-5);
            const older = metrics.slice(-10, -5);
            if (recent.length === 0 || older.length === 0) continue;
            switch(type){
                case 'system':
                    trends.push(...this.analyzeSystemTrends(recent, older, period));
                    break;
                case 'agents':
                    trends.push(...this.analyzeAgentTrends(recent, older, period));
                    break;
                case 'consensus':
                    trends.push(...this.analyzeConsensusTrends(recent, older, period));
                    break;
                case 'topology':
                    trends.push(...this.analyzeTopologyTrends(recent, older, period));
                    break;
            }
        }
        return trends;
    }
    async runBenchmarks() {
        const benchmarks = [];
        const cpuStart = Date.now();
        for(let i = 0; i < 1000000; i++){
            Math.sqrt(i);
        }
        const cpuTime = Date.now() - cpuStart;
        benchmarks.push({
            name: 'cpu-computation',
            value: cpuTime,
            unit: 'ms',
            timestamp: new Date(),
            baseline: 50
        });
        const memStart = Date.now();
        const arrays = [];
        for(let i = 0; i < 1000; i++){
            arrays.push(new Array(1000).fill(i));
        }
        const memTime = Date.now() - memStart;
        benchmarks.push({
            name: 'memory-allocation',
            value: memTime,
            unit: 'ms',
            timestamp: new Date(),
            baseline: 20
        });
        const dbStart = Date.now();
        for(let i = 0; i < 10; i++){
            await this.database.store(`benchmark-test-${i}`, {
                value: i
            }, 'temp');
            await this.database.retrieve(`benchmark-test-${i}`, 'temp');
        }
        const dbTime = Date.now() - dbStart;
        benchmarks.push({
            name: 'database-io',
            value: dbTime,
            unit: 'ms',
            timestamp: new Date(),
            baseline: 100
        });
        for (const benchmark of benchmarks){
            await this.recordBenchmark(benchmark);
        }
        return benchmarks;
    }
    async getPerformanceSummary() {
        const [health, trends, benchmarks] = await Promise.all([
            this.getSystemHealth(),
            this.getPerformanceTrends(),
            this.getRecentBenchmarks()
        ]);
        const recommendations = [
            ...health.recommendations,
            ...this.generateTrendRecommendations(trends),
            ...this.generateBenchmarkRecommendations(benchmarks)
        ];
        return {
            health,
            trends,
            benchmarks,
            recommendations: [
                ...new Set(recommendations)
            ]
        };
    }
    addToBuffer(type, data) {
        if (!this.metricsBuffer.has(type)) {
            this.metricsBuffer.set(type, []);
        }
        const buffer = this.metricsBuffer.get(type);
        buffer.push(data);
        if (buffer.length > 100) {
            buffer.shift();
        }
    }
    getBufferedMetrics(type, limit) {
        const buffer = this.metricsBuffer.get(type) || [];
        return limit ? buffer.slice(-limit) : buffer;
    }
    async updateAggregatedMetrics(type, metrics) {
        const key = `aggregated-${type}`;
        const existing = await this.database.retrieve(key, 'metrics') || {
            count: 0,
            sum: {},
            avg: {}
        };
        existing.count++;
        existing.lastUpdated = new Date().toISOString();
        await this.database.store(key, existing, 'metrics');
    }
    analyzeSystemTrends(recent, older, period) {
        const trends = [];
        const recentAvgCpu = recent.reduce((sum, m)=>sum + m.cpuUsage, 0) / recent.length;
        const olderAvgCpu = older.reduce((sum, m)=>sum + m.cpuUsage, 0) / older.length;
        const cpuChange = (recentAvgCpu - olderAvgCpu) / olderAvgCpu * 100;
        trends.push({
            metric: 'cpu-usage',
            trend: cpuChange > 5 ? 'degrading' : cpuChange < -5 ? 'improving' : 'stable',
            change: cpuChange,
            period
        });
        return trends;
    }
    analyzeAgentTrends(recent, older, period) {
        return [];
    }
    analyzeConsensusTrends(recent, older, period) {
        return [];
    }
    analyzeTopologyTrends(recent, older, period) {
        return [];
    }
    async getRecentBenchmarks() {
        const keys = await this.database.list('metrics');
        const benchmarkKeys = keys.filter((key)=>key.startsWith('benchmark-')).slice(-10);
        const benchmarks = [];
        for (const key of benchmarkKeys){
            const benchmark = await this.database.retrieve(key, 'metrics');
            if (benchmark) benchmarks.push(benchmark);
        }
        return benchmarks;
    }
    generateTrendRecommendations(trends) {
        const recommendations = [];
        trends.forEach((trend)=>{
            if (trend.trend === 'degrading') {
                recommendations.push(`${trend.metric} is degrading (${trend.change.toFixed(1)}% change) - investigate potential causes`);
            }
        });
        return recommendations;
    }
    generateBenchmarkRecommendations(benchmarks) {
        const recommendations = [];
        benchmarks.forEach((benchmark)=>{
            if (benchmark.baseline && benchmark.value > benchmark.baseline * 2) {
                recommendations.push(`${benchmark.name} performance is significantly below baseline - consider optimization`);
            }
        });
        return recommendations;
    }
}

//# sourceMappingURL=MetricsCollector.js.map