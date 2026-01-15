import fs from 'fs-extra';
import path from 'path';
import { runOcrAgent } from '../agent/ocrAgent.js';
import { updateKeywordIndex } from '../utils/indexStore.js';
import { unzip } from '../utils/zipUtils.js';

const VALID_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const ZIP_EXT = '.zip';

/**
 * Recursively runs OCR on images in the directory.
 * Tracks depth to log App and Variant progress.
 */
export async function processDirectoryRecursive(
    dir,
    config,
    processedFiles,
    depth = 0,
    context = { appName: null, variantName: null },
    progressLogger = null
) {
    let entries = await fs.readdir(dir, { withFileTypes: true });

    // Sort entries to process folders and files in a predictable order
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const hasImages = entries.some(e => e.isFile() && VALID_EXTENSIONS.includes(path.extname(e.name).toLowerCase()));

    // Fallback for flat structures
    if (depth === 2 && hasImages && !context.variantName && progressLogger) {
        context.variantName = "default";
        if (progressLogger.isVariantCompleted(context.appName, context.variantName)) {
            console.log(`Skipping completed OCR Variant: ${context.appName}/${context.variantName}`);
            return;
        }
        progressLogger.markVariantStarted(context.appName, context.variantName);
        await progressLogger.save();
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        let newContext = { ...context };

        // 1. Directory
        if (entry.isDirectory()) {
            if (depth === 1) {
                newContext.appName = entry.name;
                if (progressLogger && progressLogger.isAppCompleted(newContext.appName)) {
                    console.log(`Skipping completed OCR App: ${newContext.appName}`);
                    continue;
                }
                if (progressLogger) {
                    progressLogger.markAppStarted(newContext.appName);
                    await progressLogger.save();
                }
            } else if (depth === 2) {
                newContext.variantName = entry.name;
                if (progressLogger && progressLogger.isVariantCompleted(newContext.appName, newContext.variantName)) {
                    console.log(`Skipping completed OCR Variant: ${newContext.appName}/${newContext.variantName}`);
                    continue;
                }
                if (progressLogger) {
                    progressLogger.markVariantStarted(newContext.appName, newContext.variantName);
                    await progressLogger.save();
                }
            }

            await processDirectoryRecursive(fullPath, config, processedFiles, depth + 1, newContext, progressLogger);

            // Completion marking
            if (depth === 1 && newContext.appName && progressLogger) {
                progressLogger.markAppCompleted(newContext.appName);
                await progressLogger.save();
            } else if (depth === 2 && newContext.appName && newContext.variantName && progressLogger) {
                progressLogger.markVariantCompleted(newContext.appName, newContext.variantName);
                await progressLogger.save();
            }

            continue;
        }

        // 2. ZIP file
        if (entry.isFile() && path.extname(entry.name).toLowerCase() === ZIP_EXT) {
            const folderName = entry.name.slice(0, -ZIP_EXT.length);
            const tempUnzipDir = path.join(dir, folderName);

            const folderExists = entries.some(e => e.isDirectory() && e.name === folderName);
            if (folderExists) {
                console.log(`Skipping ZIP file because folder already exists: ${entry.name}`);
                continue;
            }

            console.log(`Unzipping for OCR: ${entry.name}`);
            try {
                unzip(fullPath, tempUnzipDir);
                await processDirectoryRecursive(tempUnzipDir, config, processedFiles, depth, context, progressLogger);
                await fs.remove(tempUnzipDir);
            } catch (err) {
                console.error(`Error processing ZIP ${entry.name}:`, err.message);
            }
            continue;
        }

        // 3. Image file
        if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (VALID_EXTENSIONS.includes(ext)) {
                // If the app/variant is already marked as completed, we might still reach here 
                // but the directory jump above handles it most cases.

                // Track already processed individual images if needed (less granular than variant)
                if (processedFiles && processedFiles.has(fullPath)) continue;

                console.log(`OCR Processing: ${entry.name}`);
                try {
                    const result = await runOcrAgent(fullPath, config);
                    const indexFile = path.resolve(process.cwd(), config.paths.indexFile);

                    await updateKeywordIndex(indexFile, result, config.ocr.keywords, config);

                    const uniqueKeywords = [...new Set(result.keywordMatches.map(m => m.keyword))];
                    console.log(`Matched keywords: ${uniqueKeywords.join(', ') || 'none'}`);
                } catch (err) {
                    console.error(`Error processing ${fullPath}:`, err.message);
                    if (progressLogger && context.appName && context.variantName) {
                        progressLogger.markVariantFailed(context.appName, context.variantName, err.message);
                        await progressLogger.save();
                    }
                }
            }
        }
    }

    // Flat structure completion
    if (depth === 2 && context.appName && context.variantName === "default" && hasImages && progressLogger) {
        progressLogger.markVariantCompleted(context.appName, context.variantName);
        await progressLogger.save();
    }
}
