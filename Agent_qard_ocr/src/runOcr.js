import fs from 'fs-extra';
import path from 'path';
import { processDirectoryRecursive } from './batch/batchOcr.js';
import { initializeIndex } from './utils/indexStore.js';
import { ProgressLogger } from './utils/progressLogger.js';

/**
 * Agent 2: OCR Agent Entry Point
 * Orchestrates the detection of keywords across processed images.
 */
const progressLogger = new ProgressLogger('Agent_qard_ocr');

async function main() {
    const cwd = process.cwd();

    // 1. Load Local Config
    const configPath = path.resolve(cwd, 'config.json');
    if (!await fs.pathExists(configPath)) {
        throw new Error(`Config file not found in ${cwd}`);
    }
    const config = await fs.readJson(configPath);
    console.log("✅ Configuration loaded.");

    await progressLogger.init();
    progressLogger.setupSystemListeners();

    // 2. Path Resolution
    // We resolve paths to absolute to prevent 'undefined' or relative path errors during recursion
    const resolvedSourceDir = path.resolve(cwd, config.paths.sourceDir);
    const outputBase = path.resolve(cwd, config.paths.outputDir);
    const latestOutputBase = path.join(outputBase, 'latest');

    await fs.ensureDir(latestOutputBase);

    const indexPath = path.join(latestOutputBase, 'indexing.json');
    const rootIndexingPath = path.join(outputBase, '../latest_indexing.json');

    // 3. Validation
    if (!(await fs.pathExists(resolvedSourceDir))) {
        console.error(`❌ Source not found: ${resolvedSourceDir}\nRun Agent1Crop first.`);
        process.exit(1);
    }

    // 4. Initialize Indexing File
    await initializeIndex(indexPath);

    // 5. Prepare Active Config
    // IMPORTANT: Adding indexFile to the config object so the batch processor can find it
    const activeConfig = {
        ...config,
        paths: {
            ...config.paths,
            sourceDir: resolvedSourceDir,
            indexFile: indexPath // Fixed the missing 'indexFile' property
        }
    };

    console.log("------------------------------------------");
    console.log("🚀 Starting Agent_qard_ocr (OCR Mode)");
    console.log(`📍 Source: ${resolvedSourceDir}`);
    console.log(`📍 Output: ${indexPath}`);
    console.log("------------------------------------------");

    const startTime = Date.now();
    try {
        await progressLogger.addRunEntry({ action: "start_batch" });

        // Start the recursive OCR process
        await processDirectoryRecursive(
            resolvedSourceDir,
            activeConfig,
            new Set(),
            0,
            { appName: null, variantName: null },
            progressLogger
        );

        await progressLogger.addRunEntry({ action: "complete_batch", status: "success" });

        // Finalize: Copy output to the shared 'latest' location for Agent 3
        await fs.copy(indexPath, rootIndexingPath);

    } catch (err) {
        console.error("❌ Batch failed:", err.message);
        await progressLogger.logError(err, { action: "complete_batch" });
        await progressLogger.addRunEntry({ action: "complete_batch", status: "failed", error: err.message });
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ OCR Batch complete in ${duration}s.`);
}

main().catch(async err => {
    console.error("Agent_qard_ocr Fatal Error:", err);
    await progressLogger.logError(err, { action: "fatal_initialization" });
    process.exit(1);
});
