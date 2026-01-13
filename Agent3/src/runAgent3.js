import fs from 'fs-extra';
import path from 'path';
import { runAgent3Batch } from './batch/batchProcess.js';

async function main() {
    const configPath = path.resolve(process.cwd(), 'config.json');
    if (!(await fs.pathExists(configPath))) {
        console.error("config.json not found!");
        process.exit(1);
    }

    const config = await fs.readJson(configPath);

    // Find latest indexing file
    let indexPath = path.resolve(process.cwd(), config.paths.indexFile);
    const latestIndexing = path.resolve(process.cwd(), '../OutputsDuringWorking/latest_indexing.json');
    if (await fs.pathExists(latestIndexing)) {
        indexPath = latestIndexing;
    }

    // Find latest source directory (Agent1Crop output)
    let sourceDir = path.resolve(process.cwd(), '../OutputsDuringWorking/Agent1Crop');
    const subdirs = (await fs.readdir(sourceDir, { withFileTypes: true }))
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort()
        .reverse();

    if (subdirs.length > 0) {
        sourceDir = path.join(sourceDir, subdirs[0]);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const workingDir = path.resolve(process.cwd(), '../OutputsDuringWorking/Agent3', timestamp);
    const finalDir = path.resolve(process.cwd(), '../outputs');

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
        await runAgent3Batch(activeConfig);
    } catch (err) {
        console.error("Fatal error in Agent3:", err);
        process.exit(1);
    }
}

main();
