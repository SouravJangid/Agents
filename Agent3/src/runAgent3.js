import fs from 'fs-extra';
import path from 'path';
import { runAgent3Batch } from './batch/batchProcess.js';
import { ProgressLogger } from './utils/progressLogger.js';

const progressLogger = new ProgressLogger('Agent3');

async function main() {
    const configPath = path.resolve(process.cwd(), 'config.json');
    if (!(await fs.pathExists(configPath))) {
        console.error("config.json not found!");
        process.exit(1);
    }

    const config = await fs.readJson(configPath);
    await progressLogger.init();

    // Always source from the latest indexing results
    const indexPath = path.resolve(process.cwd(), '../OutputsDuringWorking/latest_indexing.json');

    // Always source images from the latest Agent1Crop output
    const sourceDir = path.resolve(process.cwd(), '../OutputsDuringWorking/Agent1Crop/latest');

    // Working directory: Maintain only latest data
    const workingDir = path.resolve(process.cwd(), '../OutputsDuringWorking/Agent3/latest');

    // We don't empty directory here if we want to resume
    await fs.ensureDir(workingDir);

    // Final delivery directory
    const finalDir = path.resolve(process.cwd(), '../outputs');
    await fs.ensureDir(finalDir);

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

    try {
        await progressLogger.addRunEntry({ action: "start_batch" });
        await runAgent3Batch(activeConfig, progressLogger);
        await progressLogger.addRunEntry({ action: "complete_batch", status: "success" });
    } catch (err) {
        console.error("Fatal error in Agent3:", err);
        await progressLogger.addRunEntry({ action: "complete_batch", status: "failed", error: err.message });
        process.exit(1);
    }
}

main();
