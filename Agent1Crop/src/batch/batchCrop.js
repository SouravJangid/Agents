import fs from "fs-extra";
import path from "path";
import os from "os";
import { runCropAgent } from "../agent/cropAgent.js";
import { unzip } from "../utils/zipUtils.js";

// Limit concurrency to avoid overloading disk I/O and CPU
const CONCURRENCY_LIMIT = Math.max(1, os.cpus().length - 1);

/**
 * Recursively traverses the upload directory to find and process images.
 * Optimized for 500GB+ datasets with parallel I/O.
 */
export async function batchCropRecursive(
    currentUploadDir,
    outputRootOverride = null,
    depth = 0,
    context = { appName: null, variantName: null },
    progressLogger = null,
    activeConfig = null
) {
    const configToUse = activeConfig || fs.readJsonSync(path.resolve(process.cwd(), "config.json"));
    const uploadRoot = activeConfig ? activeConfig.paths.uploadDir : path.resolve(process.cwd(), configToUse.paths.uploadDir);
    const outputRoot = outputRootOverride || path.resolve(process.cwd(), configToUse.paths.outputDir);
    const validExt = configToUse.processing.validExtensions;
    const zipExt = ".zip";

    // Read all files and folders in the current directory
    const entries = await fs.readdir(currentUploadDir, {
        withFileTypes: true
    });

    const tasks = [];
    const subdirectories = [];
    const imageFiles = [];
    const zipFiles = [];

    // Categorize entries
    for (const entry of entries) {
        // --- 0. SKIP HIDDEN FILES (macOS ._ and .DS_Store) ---
        if (entry.name.startsWith('.') || entry.name.startsWith('._') || entry.name === '__MACOSX') {
            continue;
        }

        if (entry.isDirectory()) {
            subdirectories.push(entry);
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (ext === zipExt) {
                zipFiles.push(entry);
            } else if (validExt.includes(ext)) {
                imageFiles.push(entry);
            }
        }
    }

    // 1. Process Subdirectories (Sequential recursion to preserve app-level logging logic)
    for (const entry of subdirectories) {
        let newContext = { ...context };
        const uploadPath = path.join(currentUploadDir, entry.name);
        const relativePath = path.relative(uploadRoot, uploadPath);
        const outputPath = path.join(outputRoot, relativePath);

        if (depth === 1) {
            newContext.appName = entry.name;
            if (progressLogger && progressLogger.isAppCompleted(newContext.appName)) {
                console.log(`Skipping completed App: ${newContext.appName}`);
                continue;
            }
            if (progressLogger) {
                await progressLogger.markAppStarted(newContext.appName);
            }
        }

        await fs.ensureDir(outputPath);
        await batchCropRecursive(uploadPath, outputRoot, depth + 1, newContext, progressLogger, activeConfig);

        if (depth === 1 && newContext.appName && progressLogger) {
            await progressLogger.markAppCompleted(newContext.appName);
        }
    }

    // 2. Process ZIP Archives (Sequential because they usually contain their own structure)
    for (const entry of zipFiles) {
        let newContext = { ...context };
        const uploadPath = path.join(currentUploadDir, entry.name);
        const unzipDirName = entry.name.replace(new RegExp(zipExt + '$', 'i'), "");
        const unzipDirPath = path.join(currentUploadDir, unzipDirName);

        if (depth === 1) {
            newContext.appName = unzipDirName;
            if (progressLogger && progressLogger.isAppCompleted(newContext.appName)) {
                continue;
            }
            if (progressLogger) {
                await progressLogger.markAppStarted(newContext.appName);
            }
        }

        const folderExists = entries.some(e => e.isDirectory() && e.name === unzipDirName);
        if (folderExists) {
            console.log(`Skipping ZIP file because folder already exists: ${entry.name}`);
            continue;
        }

        console.log(`Unzipping archive: ${entry.name}`);
        try {
            await unzip(uploadPath, unzipDirPath);
            await batchCropRecursive(unzipDirPath, outputRoot, depth, newContext, progressLogger, activeConfig);
            await fs.remove(unzipDirPath);

            if (depth === 1 && newContext.appName && progressLogger) {
                await progressLogger.markAppCompleted(newContext.appName);
            }
        } catch (err) {
            console.error(`Error processing zip ${entry.name}:`, err.message);
            if (progressLogger) {
                await progressLogger.logError(err, { ...newContext, action: 'unzip', zipPath: uploadPath });
            }
        }
    }

    // 3. Process Single Images (PARALLEL)
    console.log(`Processing ${imageFiles.length} images in ${currentUploadDir} (Concurrency: ${CONCURRENCY_LIMIT})`);

    for (let i = 0; i < imageFiles.length; i += CONCURRENCY_LIMIT) {
        const chunk = imageFiles.slice(i, i + CONCURRENCY_LIMIT);
        await Promise.all(chunk.map(async (entry) => {
            const uploadPath = path.join(currentUploadDir, entry.name);
            const relativePath = path.relative(uploadRoot, uploadPath);
            const outputPath = path.join(outputRoot, relativePath);

            if (progressLogger && progressLogger.isImageProcessed(uploadPath)) {
                return;
            }

            await fs.ensureDir(path.dirname(outputPath));

            try {
                await runCropAgent(uploadPath, { outputOverride: outputPath });
                if (progressLogger) {
                    await progressLogger.markImageProcessed(uploadPath);
                }
            } catch (err) {
                console.error(`Crop Failed: ${relativePath}`, err.message);
                if (progressLogger) {
                    await progressLogger.markImageFailed(uploadPath, err.message);
                    await progressLogger.logError(err, { ...context, action: 'crop', imagePath: uploadPath });
                }
            }
        }));
    }
}
