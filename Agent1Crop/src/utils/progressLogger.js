import fs from 'fs-extra';
import path from 'path';

/**
 * ProgressLogger: Robust utility to track processing progress and log errors centrally.
 * Ensures that if a process stops, it can resume exactly where it left off and
 * provides a single source of truth for failures across all agents.
 */
class ProgressLogger {
    constructor(agentName) {
        this.agentName = agentName;
        this.apps = {};
        this.variants = {};
        this.images = {};
        this.runs = [];
        this.errors = [];

        const cwd = process.cwd();
        const configPath = path.resolve(cwd, 'config.json');

        if (!fs.existsSync(configPath)) {
            throw new Error(`[ProgressLogger] Critical: config.json not found in ${cwd}`);
        }

        const config = fs.readJsonSync(configPath);
        if (!config.paths || !config.paths.logsDir) {
            throw new Error(`[ProgressLogger] Critical: 'paths.logsDir' is not defined in config.json`);
        }

        const baseLogsDir = path.resolve(cwd, config.paths.logsDir);
        this.logsDir = path.join(baseLogsDir, 'index');
        this.appsFile = path.join(this.logsDir, 'apps.json');
        this.variantsFile = path.join(this.logsDir, 'variants.json');
        this.imagesFile = path.join(this.logsDir, 'images.json');
        this.runsFile = path.join(this.logsDir, 'runs.json');
        this.errorsFile = path.join(this.logsDir, 'errors.json');
    }

    async init() {
        await fs.ensureDir(this.logsDir);
        if (await fs.pathExists(this.appsFile)) this.apps = await fs.readJson(this.appsFile);
        if (await fs.pathExists(this.variantsFile)) this.variants = await fs.readJson(this.variantsFile);
        if (await fs.pathExists(this.imagesFile)) this.images = await fs.readJson(this.imagesFile);
        if (await fs.pathExists(this.runsFile)) this.runs = await fs.readJson(this.runsFile);
        if (await fs.pathExists(this.errorsFile)) this.errors = await fs.readJson(this.errorsFile);
    }

    async save() {
        await fs.ensureDir(this.logsDir);
        await fs.outputJson(this.appsFile, this.apps, { spaces: 2 });
        await fs.outputJson(this.variantsFile, this.variants, { spaces: 2 });
        await fs.outputJson(this.imagesFile, this.images, { spaces: 2 });
        await fs.outputJson(this.runsFile, this.runs, { spaces: 2 });
        await fs.outputJson(this.errorsFile, this.errors, { spaces: 2 });
    }

    _getKey(type, ...parts) {
        return `${this.agentName}:${parts.join('/')}`;
    }

    /**
     * Centralized error logging. 
     * Records everything from library crashes to missing files.
     */
    async logError(error, context = {}) {
        const errorEntry = {
            timestamp: new Date().toISOString(),
            agent: this.agentName,
            message: error.message || error.toString(),
            stack: error.stack || null,
            context: context
        };

        this.errors.push(errorEntry);
        console.error(`❌ [${this.agentName}] Error Logged:`, errorEntry.message);
        await this.save();
    }

    markAppStarted(appName) {
        const key = this._getKey('app', appName);
        if (!this.apps[key] || this.apps[key].status !== 'completed') {
            this.apps[key] = { agent: this.agentName, status: 'running', last_active: new Date().toISOString() };
        }
    }

    markAppCompleted(appName) {
        const key = this._getKey('app', appName);
        this.apps[key] = { agent: this.agentName, status: 'completed', completed_at: new Date().toISOString() };
    }

    isAppCompleted(appName) {
        const key = this._getKey('app', appName);
        return this.apps[key] && this.apps[key].status === 'completed';
    }

    markVariantStarted(appName, variantName) {
        const key = this._getKey('variant', appName, variantName);
        if (!this.variants[key] || this.variants[key].status !== 'completed') {
            this.variants[key] = { agent: this.agentName, status: 'running', last_active: new Date().toISOString() };
        }
    }

    markVariantCompleted(appName, variantName) {
        const key = this._getKey('variant', appName, variantName);
        this.variants[key] = { agent: this.agentName, status: 'completed', completed_at: new Date().toISOString() };
    }

    isVariantCompleted(appName, variantName) {
        const key = this._getKey('variant', appName, variantName);
        return this.variants[key] && this.variants[key].status === 'completed';
    }

    markImageProcessed(imagePath) {
        const key = this._getKey('image', imagePath);
        this.images[key] = { agent: this.agentName, status: 'processed', at: new Date().toISOString() };
    }

    markImageFailed(imagePath, error) {
        const key = this._getKey('image', imagePath);
        this.images[key] = { agent: this.agentName, status: 'failed', error, at: new Date().toISOString() };
    }

    isImageProcessed(imagePath) {
        const key = this._getKey('image', imagePath);
        return this.images[key] && this.images[key].status === 'processed';
    }

    async addRunEntry(entry) {
        this.runs.push({ agent: this.agentName, timestamp: new Date().toISOString(), ...entry });
        await this.save();
    }

    /**
     * Set up listeners for system-level interruptions (Ctrl+C, Shutdown, etc.)
     */
    setupSystemListeners() {
        const handleSignal = async (signal) => {
            await this.logError(new Error(`Process terminated by system signal: ${signal}`), {
                action: 'system_interruption',
                signal
            });
            process.exit(signal === 'SIGINT' ? 130 : 1);
        };

        process.on('SIGINT', () => handleSignal('SIGINT'));
        process.on('SIGTERM', () => handleSignal('SIGTERM'));
        process.on('SIGQUIT', () => handleSignal('SIGQUIT'));
        process.on('SIGHUP', () => handleSignal('SIGHUP'));
        process.on('SIGTSTP', () => handleSignal('SIGTSTP'));

        // Catch unhandled promise rejections or uncaught exceptions that would normally crash silently
        process.on('uncaughtException', async (err) => {
            await this.logError(err, { action: 'uncaught_exception' });
            process.exit(1);
        });

        process.on('unhandledRejection', async (reason, promise) => {
            const err = reason instanceof Error ? reason : new Error(String(reason));
            await this.logError(err, { action: 'unhandled_rejection' });
            process.exit(1);
        });
    }
}

export { ProgressLogger };
