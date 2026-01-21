import fs from 'fs-extra';
import path from 'path';
import { runAgent3Batch } from './batch/batchProcess.js';
import { ProgressLogger } from './utils/progressLogger.js';

/**
 * Agent 3: Redaction/Blur Engine
 * Role: Reads detection metadata and applies blur effects.
 */
const progressLogger = new ProgressLogger('Agent3');

async function main() {
    const cwd = process.cwd();

    // 1. Load Local Config
    const configPath = path.resolve(cwd, 'config.json');
    if (!await fs.pathExists(configPath)) {
        throw new Error(`Config file not found: ${configPath}`);
    }
    const config = await fs.readJson(configPath);
    console.log("✅ Using local Agent3 configuration.");

    await progressLogger.init();
    progressLogger.setupSystemListeners();

    // 2. Define Routing based on local config
    const indexPath = path.resolve(cwd, config.paths.indexFile);
    const sourceDir = path.resolve(cwd, config.paths.sourceDir);
    const workingDir = path.resolve(cwd, config.paths.workingDir);
    const finalDir = path.resolve(cwd, config.paths.finalOutputDir);

    await fs.ensureDir(workingDir);
    await fs.ensureDir(finalDir);

    // 3. Prepare Config for Batch
    // We ensure all paths are absolute before passing to the processor
    const activeConfig = {
        ...config,
        paths: {
            ...config.paths,
            indexFile: indexPath,
            sourceDir: sourceDir,
            workingDir: workingDir,
            finalDir: finalDir
        }
    };

    console.log("------------------------------------------");
    console.log("🚀 Starting Agent3: Blurring Engine");
    console.log(`📍 Source: ${sourceDir}`);
    console.log(`📍 Index:  ${indexPath}`);
    console.log(`📍 Final:  ${finalDir}`);
    console.log("------------------------------------------");

    try {
        await progressLogger.addRunEntry({ action: "start_batch" });
        await runAgent3Batch(activeConfig, progressLogger);
        await progressLogger.addRunEntry({ action: "complete_batch", status: "success" });
        console.log("\n✅ Agent3 processing completed successfully.");
    } catch (err) {
        console.error("\n❌ Fatal error in Agent3:", err.message);
        await progressLogger.logError(err, { action: "complete_batch" });
        await progressLogger.addRunEntry({ action: "complete_batch", status: "failed", error: err.message });
        process.exit(1);
    }
}

main().catch(async err => {
    console.error("Agent3 Fatal Error:", err);
    await progressLogger.logError(err, { action: "fatal_initialization" });
    process.exit(1);
});
