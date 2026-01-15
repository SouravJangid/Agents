import fs from 'fs-extra';
import path from 'path';
import { runAgent3Batch } from './batch/batchProcess.js';
import { ProgressLogger } from './utils/progressLogger.js';

const progressLogger = new ProgressLogger('Agent3');

async function main() {
    // 0. Workspace Root Detection
    const cwd = process.cwd();
    let workspaceRoot = path.resolve(cwd, '..');
    if (fs.existsSync(path.join(cwd, 'Agent1Crop')) && fs.existsSync(path.join(cwd, 'config.json'))) {
        workspaceRoot = cwd;
    }

    // 1. Load Local Config
    const config = await fs.readJson(path.resolve(cwd, 'config.json'));

    // 2. Load Root Config (Optional)
    const rootConfigPath = path.join(workspaceRoot, 'config.json');
    let rootConfig = null;
    if (workspaceRoot !== cwd && fs.existsSync(rootConfigPath)) {
        rootConfig = await fs.readJson(rootConfigPath);
    }

    await progressLogger.init();

    // 3. Define Routing: Root overrides Local
    const workingRoot = rootConfig
        ? path.resolve(workspaceRoot, rootConfig.pipeline.workingDir)
        : path.resolve(workspaceRoot, 'OutputsDuringWorking');

    // Source index from the working directory
    const indexPath = path.join(workingRoot, 'latest_indexing.json');

    // Source images from the Agent1 output
    const sourceDir = path.join(workingRoot, 'Agent1Crop/latest');

    // Working directory for Agent3
    const workingDir = path.join(workingRoot, 'Agent3/latest');
    await fs.ensureDir(workingDir);

    // Final delivery directory
    const finalDir = rootConfig
        ? path.resolve(workspaceRoot, rootConfig.pipeline.finalOutputDir)
        : path.resolve(workspaceRoot, 'outputs');

    await fs.ensureDir(finalDir);

    // Resolve Keywords and Replacement
    const targetWord = rootConfig?.replacement?.targetWord || config.replacement.targetWord;
    const newWord = rootConfig?.replacement?.newWord || config.replacement.newWord;

    const activeConfig = {
        ...config,
        replacement: {
            targetWord,
            newWord
        },
        paths: {
            ...config.paths,
            indexFile: indexPath,
            sourceDir: sourceDir,
            workingDir: workingDir,
            finalDir: finalDir
        }
    };

    console.log("Starting Agent3...");
    console.log(`Source Dir: ${sourceDir}`);
    console.log(`Working Directory: ${workingRoot}`);
    console.log(`Final Dir: ${finalDir}`);
    console.log(`Index File: ${indexPath}`);

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
