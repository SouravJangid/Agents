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

    // Find latest Agent1Crop output if sourceDir is the root Agent1Crop dir
    let resolvedSourceDir = path.resolve(process.cwd(), config.paths.sourceDir);
    if (path.basename(resolvedSourceDir) === 'Agent1Crop') {
        const subdirs = (await fs.readdir(resolvedSourceDir, { withFileTypes: true }))
            .filter(d => d.isDirectory())
            .map(d => d.name)
            .sort()
            .reverse();

        if (subdirs.length > 0) {
            resolvedSourceDir = path.join(resolvedSourceDir, subdirs[0]);
        }
    }

    // Timestamped output for OCR metadata
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputBase = path.resolve(process.cwd(), '../OutputsDuringWorking/Agent_qard_ocr', timestamp);
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
    await processDirectoryRecursive(resolvedSourceDir, activeConfig, new Set());
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`OCR Batch processing complete in ${duration} seconds.`);
    console.log(`Metadata saved to: ${indexPath}`);

    // Also copy to a "latest" alias for next agent to find easily
    const latestPath = path.resolve(process.cwd(), '../OutputsDuringWorking/latest_indexing.json');
    await fs.copy(indexPath, latestPath);
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
