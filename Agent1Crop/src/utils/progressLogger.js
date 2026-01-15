import fs from 'fs-extra';
import path from 'path';

class ProgressLogger {
    constructor(agentName) {
        this.agentName = agentName;
        this.apps = {};
        this.variants = {};
        this.runs = [];

        // Find default logs location relative to this agent
        const localLogsDir = path.resolve(process.cwd(), '../logs/index');

        // Try to find root config for override
        const rootConfigPath = path.resolve(process.cwd(), '../config.json');
        let logsDir = localLogsDir;

        try {
            if (fs.existsSync(rootConfigPath)) {
                const rootConfig = fs.readJsonSync(rootConfigPath);
                if (rootConfig.pipeline && rootConfig.pipeline.logsDir) {
                    logsDir = path.resolve(process.cwd(), '..', rootConfig.pipeline.logsDir, 'index');
                }
            }
        } catch (err) {
            // Fallback to local logs dir if root config is invalid or missing
            logsDir = localLogsDir;
        }

        this.logsDir = logsDir;
        this.appsFile = path.join(this.logsDir, 'apps.json');
        this.variantsFile = path.join(this.logsDir, 'variants.json');
        this.runsFile = path.join(this.logsDir, 'runs.json');
    }

    async init() {
        await fs.ensureDir(this.logsDir);
        if (await fs.pathExists(this.appsFile)) {
            this.apps = await fs.readJson(this.appsFile);
        }
        if (await fs.pathExists(this.variantsFile)) {
            this.variants = await fs.readJson(this.variantsFile);
        }
        if (await fs.pathExists(this.runsFile)) {
            this.runs = await fs.readJson(this.runsFile);
        }
    }

    async save() {
        await fs.ensureDir(this.logsDir);
        await fs.outputJson(this.appsFile, this.apps, { spaces: 2 });
        await fs.outputJson(this.variantsFile, this.variants, { spaces: 2 });
        await fs.outputJson(this.runsFile, this.runs, { spaces: 2 });
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

export { ProgressLogger };
