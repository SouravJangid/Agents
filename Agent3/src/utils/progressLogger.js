import fs from 'fs-extra';
import path from 'path';

const LOGS_DIR = path.resolve(process.cwd(), '../logs/index');
const APPS_FILE = path.join(LOGS_DIR, 'apps.json');
const VARIANTS_FILE = path.join(LOGS_DIR, 'variants.json');
const RUNS_FILE = path.join(LOGS_DIR, 'runs.json');

class ProgressLogger {
    constructor(agentName) {
        this.agentName = agentName;
        this.apps = {};
        this.variants = {};
        this.runs = [];
    }

    async init() {
        await fs.ensureDir(LOGS_DIR);
        if (await fs.pathExists(APPS_FILE)) {
            this.apps = await fs.readJson(APPS_FILE);
        }
        if (await fs.pathExists(VARIANTS_FILE)) {
            this.variants = await fs.readJson(VARIANTS_FILE);
        }
        if (await fs.pathExists(RUNS_FILE)) {
            this.runs = await fs.readJson(RUNS_FILE);
        }
    }

    async save() {
        await fs.outputJson(APPS_FILE, this.apps, { spaces: 2 });
        await fs.outputJson(VARIANTS_FILE, this.variants, { spaces: 2 });
        await fs.outputJson(RUNS_FILE, this.runs, { spaces: 2 });
    }

    _getAppKey(appName) {
        return `${this.agentName}:${appName}`;
    }

    _getVariantKey(appName, variantName) {
        return `${this.agentName}:${appName}/${variantName}`;
    }

    markAppStarted(appName) {
        const key = this._getAppKey(appName);
        if (!this.apps[key] || this.apps[key].status !== 'completed') {
            this.apps[key] = {
                agent: this.agentName,
                status: 'running',
                last_active: new Date().toISOString()
            };
        }
    }

    markAppCompleted(appName) {
        const key = this._getAppKey(appName);
        this.apps[key] = {
            agent: this.agentName,
            status: 'completed',
            completed_at: new Date().toISOString()
        };
    }

    markAppFailed(appName, error) {
        const key = this._getAppKey(appName);
        this.apps[key] = {
            agent: this.agentName,
            status: 'failed',
            error,
            last_attempt: new Date().toISOString()
        };
    }

    markVariantStarted(appName, variantName) {
        const key = this._getVariantKey(appName, variantName);
        if (!this.variants[key] || this.variants[key].status !== 'completed') {
            this.variants[key] = {
                agent: this.agentName,
                status: 'running',
                last_active: new Date().toISOString()
            };
        }
    }

    markVariantCompleted(appName, variantName) {
        const key = this._getVariantKey(appName, variantName);
        this.variants[key] = {
            agent: this.agentName,
            status: 'completed',
            completed_at: new Date().toISOString()
        };
    }

    markVariantFailed(appName, variantName, error) {
        const key = this._getVariantKey(appName, variantName);
        this.variants[key] = {
            agent: this.agentName,
            status: 'failed',
            error,
            last_attempt: new Date().toISOString()
        };
    }

    isAppCompleted(appName) {
        const key = this._getAppKey(appName);
        return this.apps[key] && this.apps[key].status === 'completed';
    }

    isVariantCompleted(appName, variantName) {
        const key = this._getVariantKey(appName, variantName);
        return this.variants[key] && this.variants[key].status === 'completed';
    }

    async addRunEntry(entry) {
        this.runs.push({
            agent: this.agentName,
            timestamp: new Date().toISOString(),
            ...entry
        });
        await this.save();
    }
}

// In each entry point, initialize with new ProgressLogger('agent_name')
export { ProgressLogger };
