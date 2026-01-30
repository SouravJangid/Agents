import fs from 'fs-extra';
import path from 'path';
import readline from 'readline';

/**
 * ProgressLogger: Hybrid version for 500GB+ datasets.
 * - Reads from OLD .json (legacy) and NEW .jsonl (optimized).
 * - Writes to .jsonl immediately (fast).
 * - Periodically syncs back to .json (maintains compatibility without the speed hit).
 */
class ProgressLogger {
    constructor(agentName) {
        this.agentName = agentName;
        this.apps = new Map();         // key -> data
        this.images = new Set();       // key (processed only)
        this.failedImages = new Map(); // key -> error
        this.runs = [];
        this.errors = [];

        // Throttling for legacy JSON writes
        this.lastLegacySync = Date.now();
        this.syncIntervalMs = 5 * 60 * 1000; // 5 minutes
        this.updateCount = 0;
        this.syncThreshold = 1000; // Every 1000 updates

        const cwd = process.cwd();
        const configPath = path.resolve(cwd, 'config.json');

        if (!fs.existsSync(configPath)) {
            throw new Error(`[ProgressLogger] Critical: config.json not found in ${cwd}`);
        }

        const config = fs.readJsonSync(configPath);
        const baseLogsDir = path.resolve(cwd, config.paths.logsDir);
        this.logsDir = path.join(baseLogsDir, 'index');

        // Legacy file paths
        this.legacyFiles = {
            apps: path.join(this.logsDir, 'apps.json'),
            images: path.join(this.logsDir, 'images.json'),
            runs: path.join(this.logsDir, 'runs.json'),
            errors: path.join(this.logsDir, 'errors.json')
        };

        // Optimized file paths
        this.jsonlFiles = {
            apps: path.join(this.logsDir, 'apps.jsonl'),
            images: path.join(this.logsDir, 'images.jsonl'),
            runs: path.join(this.logsDir, 'runs.jsonl'),
            errors: path.join(this.logsDir, 'errors.jsonl')
        };
    }

    async init() {
        await fs.ensureDir(this.logsDir);
        await this._loadLegacy();
        await this._loadAllJsonl();
        console.log(`[ProgressLogger] Resumed from logs: ${this.apps.size} apps, ${this.images.size} images`);
    }

    async _loadLegacy() {
        if (await fs.pathExists(this.legacyFiles.apps)) {
            try {
                const data = await fs.readJson(this.legacyFiles.apps);
                Object.entries(data).forEach(([key, val]) => this.apps.set(key, val));
            } catch (e) {
                console.warn(`[ProgressLogger] Could not read legacy apps.json: ${e.message}`);
            }
        }
        if (await fs.pathExists(this.legacyFiles.images)) {
            try {
                const data = await fs.readJson(this.legacyFiles.images);
                Object.entries(data).forEach(([key, val]) => {
                    if (val.status === 'processed') this.images.add(key);
                    else if (val.status === 'failed') this.failedImages.set(key, val.error);
                });
            } catch (e) {
                console.warn(`[ProgressLogger] Could not read legacy images.json: ${e.message}`);
            }
        }
        if (await fs.pathExists(this.legacyFiles.runs)) {
            try {
                this.runs = await fs.readJson(this.legacyFiles.runs);
            } catch (e) { }
        }
        if (await fs.pathExists(this.legacyFiles.errors)) {
            try {
                this.errors = await fs.readJson(this.legacyFiles.errors);
            } catch (e) { }
        }
    }

    async _loadAllJsonl() {
        await this._loadJsonl(this.jsonlFiles.apps, line => {
            const data = JSON.parse(line);
            this.apps.set(data.key || this._getKey('app', data.name), data);
        });

        await this._loadJsonl(this.jsonlFiles.images, line => {
            const data = JSON.parse(line);
            const key = data.key || this._getKey('image', data.path);
            if (data.status === 'processed') {
                this.images.add(key);
                this.failedImages.delete(key);
            } else if (data.status === 'failed') {
                this.failedImages.set(key, data.error);
            }
        });

        await this._loadJsonl(this.jsonlFiles.runs, line => this.runs.push(JSON.parse(line)));
        await this._loadJsonl(this.jsonlFiles.errors, line => this.errors.push(JSON.parse(line)));
    }

    async _loadJsonl(filePath, onLine) {
        if (!await fs.pathExists(filePath)) return;
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
        for await (const line of rl) {
            if (line.trim()) {
                try {
                    onLine(line);
                } catch (e) {
                    console.error(`[ProgressLogger] Failed to parse line in ${filePath}: ${e.message}`);
                }
            }
        }
    }

    async _appendJsonl(filePath, data) {
        await fs.appendFile(filePath, JSON.stringify(data) + '\n');
        this.updateCount++;
        await this._checkSync();
    }

    async _checkSync() {
        const now = Date.now();
        if (this.updateCount >= this.syncThreshold || (now - this.lastLegacySync) > this.syncIntervalMs) {
            await this.saveLegacy();
        }
    }

    async saveLegacy() {
        try {
            console.log(`[ProgressLogger] Syncing to legacy JSON files...`);
            const appsObj = Object.fromEntries(this.apps);
            const imagesObj = {};

            // Reconstruct imagesObj for legacy compatibility
            this.images.forEach(key => imagesObj[key] = { status: 'processed', agent: this.agentName });
            this.failedImages.forEach((err, key) => imagesObj[key] = { status: 'failed', error: err, agent: this.agentName });

            await fs.outputJson(this.legacyFiles.apps, appsObj, { spaces: 2 });
            await fs.outputJson(this.legacyFiles.images, imagesObj, { spaces: 2 });
            await fs.outputJson(this.legacyFiles.runs, this.runs, { spaces: 2 });
            await fs.outputJson(this.legacyFiles.errors, this.errors, { spaces: 2 });

            this.lastLegacySync = Date.now();
            this.updateCount = 0;
        } catch (err) {
            console.error(`[ProgressLogger] Failed to sync legacy JSON: ${err.message}`);
        }
    }

    _getKey(type, ...parts) {
        return `${this.agentName}:${parts.join('/')}`;
    }

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
        await this._appendJsonl(this.jsonlFiles.errors, errorEntry);
    }

    async markAppStarted(appName) {
        const key = this._getKey('app', appName);
        const existing = this.apps.get(key);
        if (!existing || existing.status !== 'completed') {
            const data = { key, agent: this.agentName, status: 'running', last_active: new Date().toISOString() };
            this.apps.set(key, data);
            await this._appendJsonl(this.jsonlFiles.apps, data);
        }
    }

    async markAppCompleted(appName) {
        const key = this._getKey('app', appName);
        const data = { key, agent: this.agentName, status: 'completed', completed_at: new Date().toISOString() };
        this.apps.set(key, data);
        await this._appendJsonl(this.jsonlFiles.apps, data);
    }

    isAppCompleted(appName) {
        const key = this._getKey('app', appName);
        const app = this.apps.get(key);
        return app && app.status === 'completed';
    }

    async markImageProcessed(imagePath) {
        const key = this._getKey('image', imagePath);
        this.images.add(key);
        await this._appendJsonl(this.jsonlFiles.images, { key, agent: this.agentName, status: 'processed', at: new Date().toISOString() });
    }

    async markImageFailed(imagePath, error) {
        const key = this._getKey('image', imagePath);
        const errorStr = error instanceof Error ? error.message : String(error);
        this.failedImages.set(key, errorStr);
        await this._appendJsonl(this.jsonlFiles.images, { key, agent: this.agentName, status: 'failed', error: errorStr, at: new Date().toISOString() });
    }

    isImageProcessed(imagePath) {
        const key = this._getKey('image', imagePath);
        return this.images.has(key);
    }

    async addRunEntry(entry) {
        const runData = { agent: this.agentName, timestamp: new Date().toISOString(), ...entry };
        this.runs.push(runData);
        await this._appendJsonl(this.jsonlFiles.runs, runData);
    }

    async save() {
        await this.saveLegacy();
    }

    setupSystemListeners() {
        const handleSignal = async (signal) => {
            console.log(`\n[ProgressLogger] System signal received: ${signal}. Saving state...`);
            await this.saveLegacy();
            process.exit(0);
        };
        process.on('SIGINT', () => handleSignal('SIGINT'));
        process.on('SIGTERM', () => handleSignal('SIGTERM'));

        process.on('uncaughtException', async (err) => {
            await this.logError(err, { action: 'uncaught_exception' });
            await this.saveLegacy();
            process.exit(1);
        });
    }
}

export { ProgressLogger };
