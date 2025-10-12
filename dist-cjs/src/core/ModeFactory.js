import { StandardInit } from '../modes/StandardInit.js';
import { GitHubInit } from '../modes/GitHubInit.js';
import { HiveMindInit } from '../modes/HiveMindInit.js';
import { SparcInit } from '../modes/SparcInit.js';
import { NeuralInit } from '../modes/NeuralInit.js';
import { EnterpriseInit } from '../modes/EnterpriseInit.js';
export class ModeFactory {
    modes = new Map();
    constructor(){
        this.registerModes();
    }
    registerModes() {
        this.modes.set('standard', ()=>new StandardInit());
        this.modes.set('github', ()=>new GitHubInit());
        this.modes.set('hive-mind', ()=>new HiveMindInit());
        this.modes.set('sparc', ()=>new SparcInit());
        this.modes.set('neural', ()=>new NeuralInit());
        this.modes.set('enterprise', ()=>new EnterpriseInit());
    }
    createMode(mode) {
        const modeFactory = this.modes.get(mode);
        if (!modeFactory) {
            throw new Error(`Unknown initialization mode: ${mode}. Available modes: ${this.getAvailableModes().join(', ')}`);
        }
        return modeFactory();
    }
    getAvailableModes() {
        return Array.from(this.modes.keys());
    }
    getModeDescriptions() {
        const descriptions = {};
        for (const mode of this.getAvailableModes()){
            try {
                const modeInstance = this.createMode(mode);
                descriptions[mode] = modeInstance.getDescription();
            } catch (error) {
                descriptions[mode] = `Error loading mode: ${error}`;
            }
        }
        return descriptions;
    }
    validateMode(mode) {
        try {
            const modeInstance = this.createMode(mode);
            return modeInstance.validate();
        } catch (error) {
            return false;
        }
    }
    getRequiredComponents(mode) {
        try {
            const modeInstance = this.createMode(mode);
            return modeInstance.getRequiredComponents();
        } catch (error) {
            return [];
        }
    }
    registerCustomMode(mode, factory) {
        this.modes.set(mode, factory);
    }
    unregisterMode(mode) {
        return this.modes.delete(mode);
    }
}

//# sourceMappingURL=ModeFactory.js.map