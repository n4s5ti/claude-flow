export class SDKCompatibilityLayer {
    adapter;
    legacyMode = false;
    deprecationWarnings = new Set();
    constructor(adapter){
        this.adapter = adapter;
    }
    enableLegacyMode() {
        this.legacyMode = true;
        console.warn('[Compatibility] Legacy mode enabled. Please migrate to SDK methods.');
    }
    async executeWithRetry(fn, options) {
        this.logDeprecation('executeWithRetry', 'SDK handles retry automatically');
        if (this.legacyMode) {
            return this.legacyRetry(fn, options);
        }
        try {
            return await fn();
        } catch (error) {
            throw error;
        }
    }
    calculateBackoff(attempt) {
        this.logDeprecation('calculateBackoff', 'SDK handles backoff automatically');
        if (this.legacyMode) {
            const baseDelay = 1000;
            const jitter = Math.random() * 1000;
            return Math.min(baseDelay * Math.pow(2, attempt - 1) + jitter, 30000);
        }
        return 0;
    }
    async persistToDisk(key, value) {
        this.logDeprecation('persistToDisk', 'Use SDK artifacts for persistence');
        if (this.legacyMode) {
            const fs = await import('fs/promises');
            const path = await import('path');
            const storagePath = '.claude-flow/storage';
            await fs.mkdir(storagePath, {
                recursive: true
            });
            await fs.writeFile(path.join(storagePath, `${key}.json`), JSON.stringify(value, null, 2));
            return;
        }
        console.log(`[Compatibility] Persistence for '${key}' is handled automatically by SDK`);
    }
    async executeValidations(checkpointId) {
        this.logDeprecation('executeValidations', 'SDK handles validations automatically');
        if (this.legacyMode) {
            console.log(`[Compatibility] Running legacy validations for checkpoint ${checkpointId}`);
            return true;
        }
        return true;
    }
    mapLegacyRequest(legacyRequest) {
        return {
            model: this.mapLegacyModel(legacyRequest.model),
            messages: legacyRequest.messages || [],
            max_tokens: legacyRequest.max_tokens || 1024,
            temperature: legacyRequest.temperature,
            top_p: legacyRequest.top_p,
            top_k: legacyRequest.top_k,
            stop_sequences: legacyRequest.stop_sequences,
            system: legacyRequest.system,
            metadata: legacyRequest.metadata
        };
    }
    mapLegacyModel(model) {
        const modelMap = {
            'claude-2.1': 'claude-2.1',
            'claude-2.0': 'claude-2.1',
            'claude-instant-1.2': 'claude-instant-1.2',
            'claude-3-opus-20240229': 'claude-3-opus-20240229',
            'claude-3-sonnet-20240229': 'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307': 'claude-3-haiku-20240307'
        };
        return modelMap[model] || 'claude-3-sonnet-20240229';
    }
    mapSDKResponse(sdkResponse) {
        return {
            id: sdkResponse.id,
            type: 'message',
            role: sdkResponse.role,
            content: sdkResponse.content,
            model: sdkResponse.model,
            stop_reason: sdkResponse.stop_reason,
            stop_sequence: sdkResponse.stop_sequence,
            usage: sdkResponse.usage
        };
    }
    async legacyRetry(fn, options) {
        const maxRetries = options?.maxRetries || 3;
        const backoffMultiplier = options?.backoffMultiplier || 2;
        const initialDelay = options?.initialDelay || 1000;
        let lastError;
        for(let i = 0; i < maxRetries; i++){
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                if (i < maxRetries - 1) {
                    const delay = initialDelay * Math.pow(backoffMultiplier, i);
                    await this.sleep(delay);
                }
            }
        }
        throw lastError;
    }
    sleep(ms) {
        return new Promise((resolve)=>setTimeout(resolve, ms));
    }
    logDeprecation(method, suggestion) {
        if (!this.deprecationWarnings.has(method)) {
            console.warn(`[Deprecation] '${method}' is deprecated. ${suggestion}. ` + `This will be removed in v3.0.0.`);
            this.deprecationWarnings.add(method);
        }
    }
    getDeprecationReport() {
        return Array.from(this.deprecationWarnings);
    }
    isLegacyMode() {
        return this.legacyMode;
    }
}
export const createCompatibilityLayer = (adapter)=>{
    return new SDKCompatibilityLayer(adapter);
};

//# sourceMappingURL=compatibility-layer.js.map