import fs from 'fs-extra';
import path from 'path';
import { runAgent3Batch } from './batch/batchProcess.js';
import { ProgressLogger } from './utils/progressLogger.js';

const progressLogger = new ProgressLogger('Agent3');

async function main() {
    // 1. Load Local Config
    const localConfigPath = path.resolve(process.cwd(), 'config.json');
    if (!(await fs.pathExists(localConfigPath))) {
        console.error("Local config.json not found!");
        process.exit(1);
    }
    const localConfig = await fs.readJson(localConfigPath);

    // 2. Load Root Config (Optional)
    const rootConfigPath = path.resolve(process.cwd(), '../config.json');
    let rootConfig = null;
    if (await fs.pathExists(rootConfigPath)) {
        rootConfig = await fs.readJson(rootConfigPath);
    }

    await progressLogger.init();

    // 3. Define Routing: Root overrides Local
    const workingRoot = path.resolve(process.cwd(), rootConfig ? rootConfig.pipeline.workingDir : "../OutputsDuringWorking");

    // Source index from the working directory
    const indexPath = rootConfig
        ? path.join(workingRoot, 'latest_indexing.json')
        : path.resolve(process.cwd(), localConfig.paths.indexFile);

    // Source images from the Agent1 output
    const sourceDir = rootConfig
        ? path.join(workingRoot, 'Agent1Crop/latest')
        : path.resolve(process.cwd(), localConfig.paths.sourceDir);

    // Working directory for Agent3
    const workingDir = rootConfig
        ? path.join(workingRoot, 'Agent3/latest')
        : path.resolve(process.cwd(), localConfig.paths.workingDir, 'latest');

    await fs.ensureDir(workingDir);

    // Final delivery directory
    const finalDir = rootConfig
        ? path.resolve(process.cwd(), '..', rootConfig.pipeline.finalOutputDir)
        : path.resolve(process.cwd(), localConfig.paths.finalOutputDir);

    await fs.ensureDir(finalDir);

    // Resolve Keywords and Replacement
    const targetWord = rootConfig?.replacement?.targetWord || localConfig.replacement.targetWord;
    const newWord = rootConfig?.replacement?.newWord || localConfig.replacement.newWord;

    const activeConfig = {
        ...localConfig,
        replacement: {
            targetWord,
            newWord
        },
        paths: {
            ...localConfig.paths,
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
