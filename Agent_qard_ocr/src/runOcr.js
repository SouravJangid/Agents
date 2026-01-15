import fs from 'fs-extra';
import path from 'path';
import { processDirectoryRecursive } from './batch/batchOcr.js';
import { initializeIndex } from './utils/indexStore.js';
import { ProgressLogger } from './utils/progressLogger.js';

const progressLogger = new ProgressLogger('Agent_qard_ocr');

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

    // Source comes from the output of Agent1Crop
    const resolvedSourceDir = path.join(workingRoot, 'Agent1Crop/latest');

    // Output based on workingDir
    const outputBase = path.join(workingRoot, 'Agent_qard_ocr/latest');
    await fs.ensureDir(outputBase);

    const indexPath = path.join(outputBase, 'indexing.json');

    // Shared index location
    const latestPath = path.join(workingRoot, 'latest_indexing.json');

    console.log("Starting Agent_qard_ocr...");
    console.log(`Source Directory: ${resolvedSourceDir}`);
    console.log(`Working Directory: ${workingRoot}`);
    console.log(`Index File: ${indexPath}`);

    if (!(await fs.pathExists(resolvedSourceDir))) {
        console.error(`Source directory ${resolvedSourceDir} does not exist! Run Agent1Crop first.`);
        process.exit(1);
    }

    await initializeIndex(indexPath);

    // Update config paths temporarily for this run
    const activeKeywords = rootConfig?.ocr?.keywords || config.ocr.keywords;

    const activeConfig = {
        ...config,
        ocr: {
            ...config.ocr,
            keywords: activeKeywords
        },
        paths: {
            ...config.paths,
            sourceDir: resolvedSourceDir,
            indexFile: indexPath
        }
    };

    const startTime = Date.now();
    try {
        await progressLogger.addRunEntry({ action: "start_batch" });
        await processDirectoryRecursive(resolvedSourceDir, activeConfig, new Set(), 0, { appName: null, variantName: null }, progressLogger);
        await progressLogger.addRunEntry({ action: "complete_batch", status: "success" });
    } catch (err) {
        console.error("OCR Batch failed:", err.message);
        await progressLogger.addRunEntry({ action: "complete_batch", status: "failed", error: err.message });
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`OCR Batch processing complete in ${duration} seconds.`);
    console.log(`Metadata saved to: ${indexPath}`);

    // Update the indexing file link
    await fs.copy(indexPath, latestPath);
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
