import fs from 'fs-extra';
import path from 'path';
import { processDirectoryRecursive } from './batch/batchOcr.js';
import { initializeIndex } from './utils/indexStore.js';
import { ProgressLogger } from './utils/progressLogger.js';

const progressLogger = new ProgressLogger('Agent_qard_ocr');

async function main() {
    const configPath = path.resolve(process.cwd(), 'config.json');
    if (!(await fs.pathExists(configPath))) {
        console.error("config.json not found!");
        process.exit(1);
    }

    const config = await fs.readJson(configPath);
    await progressLogger.init();

    // Dynamic resolution of sourceDir: always point to Agent1Crop's latest output
    let resolvedSourceDir = path.resolve(process.cwd(), '../OutputsDuringWorking/Agent1Crop/latest');

    if (!(await fs.pathExists(resolvedSourceDir))) {
        // Fallback or legacy check
        resolvedSourceDir = path.resolve(process.cwd(), config.paths.sourceDir);
    }

    // Output Base: Maintain only latest data
    const outputBase = path.resolve(process.cwd(), '../OutputsDuringWorking/Agent_qard_ocr/latest');

    // We don't empty directory here if we want to resume
    // However, index store handles incremental updates to indexing.json
    await fs.ensureDir(outputBase);

    const indexPath = path.join(outputBase, 'indexing.json');

    console.log("Starting Agent_qard_ocr...");
    console.log(`Source Directory: ${resolvedSourceDir}`);
    console.log(`Index File: ${indexPath}`);

    if (!(await fs.pathExists(resolvedSourceDir))) {
        console.error(`Source directory ${resolvedSourceDir} does not exist!`);
        process.exit(1);
    }

    await initializeIndex(indexPath);

    // Update config paths temporarily for this run
    const activeConfig = {
        ...config,
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

    // Update the root latest_indexing.json link/file
    const latestPath = path.resolve(process.cwd(), '../OutputsDuringWorking/latest_indexing.json');
    await fs.copy(indexPath, latestPath);
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
