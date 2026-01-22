import fs from "fs-extra";
import path from "path";
import { runOcrAgent } from "../agent/ocrAgent.js";
import { updateKeywordIndex } from "../utils/indexStore.js";
import { initWorker, terminateWorker } from "../services/ocrService.js";
import { unzip } from "../utils/zipUtils.js";

const VALID_EXT = ['.png', '.jpg', '.jpeg', '.webp'];
const ZIP_EXT = '.zip';

/**
 * Recursively scans directories for images and runs OCR.
 * Identifies App and Variant context for the index.
 */
export async function processDirectoryRecursive(
    dir,
    config,
    processedFiles,
    depth = 0,
    context = { appName: null, variantName: null },
    progressLogger = null
) {
    // 0. Initialize worker at the very beginning of the batch (root call)
    if (depth === 0) {
        await initWorker(config.ocr.languages || 'eng');
    }

    let entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    for (const entry of entries) {
        // --- 0. SKIP HIDDEN FILES (macOS ._ and .DS_Store) and other system files ---
        if (entry.name.startsWith('.') || entry.name.startsWith('._') || entry.name === '__MACOSX') {
            continue;
        }

        const fullPath = path.join(dir, entry.name);
        let newContext = { ...context };

        // 1. Directory Traversal
        if (entry.isDirectory()) {
            if (depth === 1) newContext.appName = entry.name;

            // Tracking and Skip Logic
            if (progressLogger && depth === 1) {
                if (progressLogger.isAppCompleted(newContext.appName)) {
                    console.log(`Skipping completed App: ${newContext.appName}`);
                    continue;
                }
                progressLogger.markAppStarted(newContext.appName);
                await progressLogger.save();
            }

            await processDirectoryRecursive(fullPath, config, processedFiles, depth + 1, newContext, progressLogger);

            // Mark Completion
            if (progressLogger && depth === 1) {
                progressLogger.markAppCompleted(newContext.appName);
                await progressLogger.save();
            }
            continue;
        }

        // 2. ZIP extraction (if needed)
        if (entry.isFile() && path.extname(entry.name).toLowerCase() === ZIP_EXT) {
            const folderName = entry.name.slice(0, -ZIP_EXT.length);
            const tempUnzipDir = path.join(dir, folderName);
            if (!await fs.pathExists(tempUnzipDir)) {
                try {
                    unzip(fullPath, tempUnzipDir);
                    await processDirectoryRecursive(tempUnzipDir, config, processedFiles, depth, context, progressLogger);
                    await fs.remove(tempUnzipDir);
                } catch (err) {
                    console.error(`Failed ZIP: ${entry.name}`, err.message);
                    if (progressLogger) await progressLogger.logError(err, { ...context, action: 'unzip', zipPath: fullPath });
                }
            }
            continue;
        }

        // 3. Image Processing
        if (entry.isFile() && VALID_EXT.includes(path.extname(entry.name).toLowerCase())) {

            // Resume Check
            if (progressLogger && progressLogger.isImageProcessed(fullPath)) {
                continue;
            }

            try {
                // Run OCR Agent
                const result = await runOcrAgent(fullPath, config);

                if (result.status === "matched") {
                    console.log(`✨ Match: ${entry.name} -> ${result.keywordMatches.map(m => m.keyword).join(', ')}`);
                    // Save results to the keyword index
                    await updateKeywordIndex(config.paths.indexFile, result, config.ocr.keywords, config);
                }

                if (progressLogger) {
                    progressLogger.markImageProcessed(fullPath);
                    await progressLogger.save();
                }
            } catch (err) {
                console.error(`❌ OCR Failed [${entry.name}]:`, err.message);
                if (progressLogger) {
                    progressLogger.markImageFailed(fullPath, err.message);
                    await progressLogger.logError(err, { ...context, action: 'ocr', imagePath: fullPath });
                }
            }
        }
    }

    // 4. Cleanup worker at the end of the root call
    if (depth === 0) {
        await terminateWorker();
    }
}
