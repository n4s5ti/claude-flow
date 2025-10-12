export class SparcInit {
    getDescription() {
        return 'SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) initialization with TDD workflow';
    }
    getRequiredComponents() {
        return [
            'ConfigManager',
            'DatabaseManager',
            'TopologyManager',
            'AgentRegistry',
            'MCPIntegrator'
        ];
    }
    validate() {
        return true;
    }
    async initialize(config) {
        const components = [];
        try {
            if (config.configManager) {
                components.push('ConfigManager');
            }
            if (config.databaseManager) {
                await config.databaseManager.initialize();
                components.push('DatabaseManager');
            }
            if (config.topologyManager) {
                await config.topologyManager.configure('hierarchical', []);
                components.push('TopologyManager');
            }
            if (config.agentRegistry) {
                await config.agentRegistry.initialize();
                components.push('AgentRegistry');
            }
            if (config.agentRegistry) {
                await config.agentRegistry.spawn('coordinator', {
                    capabilities: [
                        'sparc-coordination',
                        'workflow-management',
                        'tdd-orchestration'
                    ],
                    metadata: {
                        role: 'sparc-coordinator',
                        phase: 'all',
                        authority: 'high'
                    }
                });
                await config.agentRegistry.spawn('analyst', {
                    capabilities: [
                        'requirement-analysis',
                        'specification-writing',
                        'user-story-creation'
                    ],
                    metadata: {
                        role: 'specification-agent',
                        phase: 'specification',
                        workflow: 'sparc'
                    }
                });
                await config.agentRegistry.spawn('researcher', {
                    capabilities: [
                        'algorithm-design',
                        'pseudocode-creation',
                        'logic-planning'
                    ],
                    metadata: {
                        role: 'pseudocode-agent',
                        phase: 'pseudocode',
                        workflow: 'sparc'
                    }
                });
                await config.agentRegistry.spawn('reviewer', {
                    capabilities: [
                        'system-architecture',
                        'design-patterns',
                        'component-design'
                    ],
                    metadata: {
                        role: 'architecture-agent',
                        phase: 'architecture',
                        workflow: 'sparc'
                    }
                });
                await config.agentRegistry.spawn('coder', {
                    capabilities: [
                        'test-driven-development',
                        'unit-testing',
                        'refactoring',
                        'implementation'
                    ],
                    metadata: {
                        role: 'refinement-agent',
                        phase: 'refinement',
                        workflow: 'sparc'
                    }
                });
                await config.agentRegistry.spawn('tester', {
                    capabilities: [
                        'integration-testing',
                        'validation',
                        'quality-assurance',
                        'documentation'
                    ],
                    metadata: {
                        role: 'completion-agent',
                        phase: 'completion',
                        workflow: 'sparc'
                    }
                });
                components.push('SparcAgents');
            }
            if (config.mcpIntegrator) {
                await config.mcpIntegrator.initialize();
                const sparcStatus = await config.mcpIntegrator.executeCommand({
                    tool: 'claude-flow',
                    function: 'sparc_mode',
                    parameters: {
                        mode: 'dev',
                        task_description: 'Initialize SPARC workflow'
                    }
                });
                if (sparcStatus.success) {
                    components.push('SparcMCP');
                }
            }
            if (config.databaseManager) {
                await config.databaseManager.store('sparc-config', {
                    initialized: true,
                    mode: 'sparc',
                    phases: [
                        'specification',
                        'pseudocode',
                        'architecture',
                        'refinement',
                        'completion'
                    ],
                    tddEnabled: true,
                    workflowActive: false,
                    currentPhase: null,
                    timestamp: new Date().toISOString()
                }, 'sparc');
                const phases1 = [
                    'specification',
                    'pseudocode',
                    'architecture',
                    'refinement',
                    'completion'
                ];
                for (const phase of phases1){
                    await config.databaseManager.store(`phase-${phase}`, {
                        name: phase,
                        status: 'pending',
                        agent: null,
                        artifacts: [],
                        dependencies: this.getPhaseDependencies(phase)
                    }, 'sparc');
                }
                await config.databaseManager.store('tdd-status', {
                    testSuites: [],
                    coverage: 0,
                    redGreenRefactor: {
                        red: [],
                        green: [],
                        refactor: []
                    }
                }, 'sparc');
                components.push('SparcMemory');
            }
            if (config.databaseManager) {
                await config.databaseManager.store('workflow-templates', {
                    'feature-development': {
                        phases: phases.map((phase)=>({
                                name: phase,
                                description: this.getPhaseDescription(phase),
                                estimatedDuration: this.getPhaseEstimatedDuration(phase),
                                deliverables: this.getPhaseDeliverables(phase)
                            }))
                    }
                }, 'sparc');
                components.push('SparcTemplates');
            }
            return {
                success: true,
                mode: 'sparc',
                components,
                topology: 'hierarchical',
                message: 'SPARC workflow initialization completed successfully - TDD methodology active',
                metadata: {
                    sparcPhases: 5,
                    tddEnabled: true,
                    agentSpecialization: true,
                    workflowOrchestration: true,
                    testDrivenDevelopment: true
                }
            };
        } catch (error) {
            return {
                success: false,
                mode: 'sparc',
                components,
                error: error instanceof Error ? error.message : String(error),
                message: 'SPARC initialization failed'
            };
        }
    }
    getPhaseDependencies(phase) {
        const dependencies = {
            'specification': [],
            'pseudocode': [
                'specification'
            ],
            'architecture': [
                'specification',
                'pseudocode'
            ],
            'refinement': [
                'specification',
                'pseudocode',
                'architecture'
            ],
            'completion': [
                'specification',
                'pseudocode',
                'architecture',
                'refinement'
            ]
        };
        return dependencies[phase] || [];
    }
    getPhaseDescription(phase) {
        const descriptions = {
            'specification': 'Analyze requirements and create detailed specifications',
            'pseudocode': 'Design algorithms and create pseudocode representations',
            'architecture': 'Design system architecture and component structure',
            'refinement': 'Implement code using Test-Driven Development methodology',
            'completion': 'Integration testing, validation, and documentation'
        };
        return descriptions[phase] || 'Unknown phase';
    }
    getPhaseEstimatedDuration(phase) {
        const durations = {
            'specification': 1800,
            'pseudocode': 1200,
            'architecture': 2400,
            'refinement': 3600,
            'completion': 1800
        };
        return durations[phase] || 1800;
    }
    getPhaseDeliverables(phase) {
        const deliverables = {
            'specification': [
                'Requirements document',
                'User stories',
                'Acceptance criteria'
            ],
            'pseudocode': [
                'Algorithm pseudocode',
                'Logic flow diagrams',
                'Data structures'
            ],
            'architecture': [
                'System architecture',
                'Component diagrams',
                'API specifications'
            ],
            'refinement': [
                'Test suites',
                'Implementation code',
                'Refactored code'
            ],
            'completion': [
                'Integration tests',
                'Documentation',
                'Deployment artifacts'
            ]
        };
        return deliverables[phase] || [];
    }
}

//# sourceMappingURL=SparcInit.js.map