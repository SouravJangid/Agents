import fs from 'fs-extra';
import path from 'path';
import { processDirectoryRecursive } from './batch/batchOcr.js';
import { initializeIndex } from './utils/indexStore.js';

async function main() {
    const configPath = path.resolve(process.cwd(), 'config.json');
    if (!(await fs.pathExists(configPath))) {
        console.error("config.json not found!");
        process.exit(1);
    }

    const config = await fs.readJson(configPath);
    const sourceDir = path.resolve(process.cwd(), config.paths.sourceDir);
    const indexPath = path.resolve(process.cwd(), config.paths.indexFile);

    console.log("Starting Agent_qard_ocr...");
    console.log(`Source Directory: ${sourceDir}`);
    console.log(`Index File: ${indexPath}`);

    if (!(await fs.pathExists(sourceDir))) {
        console.error(`Source directory ${sourceDir} does not exist!`);
        process.exit(1);
    }

    await initializeIndex(indexPath);

    const startTime = Date.now();
    await processDirectoryRecursive(sourceDir, config, new Set());
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`OCR Batch processing complete in ${duration} seconds.`);
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
