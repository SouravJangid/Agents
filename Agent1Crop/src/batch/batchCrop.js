import fs from "fs-extra";
import path from "path";
import { runCropAgent } from "../agent/cropAgent.js";
import { unzip } from "../utils/zipUtils.js";

const config = fs.readJsonSync(path.resolve(process.cwd(), "config.json"));

const UPLOAD_ROOT = path.resolve(process.cwd(), config.paths.uploadDir);
const VALID_EXT = config.processing.validExtensions;
const ZIP_EXT = ".zip";

/**
 * Recursively crops images in the upload directory.
 * Tracks depth to log App and Variant progress.
 * 
 * Target structure:
 * Level 1 (uploads/platform): Entry = AppName
 * Level 2 (uploads/platform/app): Entry = VariantName
 */
export async function batchCropRecursive(
    currentUploadDir = UPLOAD_ROOT,
    outputRootOverride = null,
    depth = 0,
    context = { appName: null, variantName: null },
    progressLogger = null
) {
    const outputRoot = outputRootOverride || path.resolve(process.cwd(), config.paths.outputDir);

    const entries = await fs.readdir(currentUploadDir, {
        withFileTypes: true
    });

    // Check if this directory directly contains images (Variant identification)
    const folderContainsImages = entries.some(e => e.isFile() && VALID_EXT.includes(path.extname(e.name).toLowerCase()));

    // Fallback for flat structures (App/Images instead of App/Variant/Images)
    if (depth === 2 && folderContainsImages && !context.variantName && progressLogger) {
        context.variantName = "default";
        if (progressLogger.isVariantCompleted(context.appName, context.variantName)) {
            console.log(`Skipping completed Variant: ${context.appName}/${context.variantName}`);
            return;
        }
        progressLogger.markVariantStarted(context.appName, context.variantName);
        await progressLogger.save();
    }

    for (const entry of entries) {
        const uploadPath = path.join(currentUploadDir, entry.name);
        const relativePath = path.relative(UPLOAD_ROOT, uploadPath);
        const outputPath = path.join(outputRoot, relativePath);

        let newContext = { ...context };

        // 1. Directory
        if (entry.isDirectory()) {
            if (depth === 1) {
                newContext.appName = entry.name;
                if (progressLogger && progressLogger.isAppCompleted(newContext.appName)) {
                    console.log(`Skipping completed App: ${newContext.appName}`);
                    continue;
                }
                if (progressLogger) {
                    progressLogger.markAppStarted(newContext.appName);
                    await progressLogger.save();
                }
            } else if (depth === 2) {
                newContext.variantName = entry.name;
                if (progressLogger && progressLogger.isVariantCompleted(newContext.appName, newContext.variantName)) {
                    console.log(`Skipping completed Variant: ${newContext.appName}/${newContext.variantName}`);
                    continue;
                }
                if (progressLogger) {
                    progressLogger.markVariantStarted(newContext.appName, newContext.variantName);
                    await progressLogger.save();
                }
            }

            await fs.ensureDir(outputPath);
            await batchCropRecursive(uploadPath, outputRoot, depth + 1, newContext, progressLogger);

            // Completion marking for variants with subdirectories
            if (depth === 2 && newContext.appName && newContext.variantName && progressLogger) {
                progressLogger.markVariantCompleted(newContext.appName, newContext.variantName);
                await progressLogger.save();
            } else if (depth === 1 && newContext.appName && progressLogger) {
                progressLogger.markAppCompleted(newContext.appName);
                await progressLogger.save();
            }

            continue;
        }

        // 2. ZIP file
        if (entry.isFile() && path.extname(entry.name).toLowerCase() === ZIP_EXT) {
            const unzipDirName = entry.name.replace(new RegExp(ZIP_EXT + '$', 'i'), "");
            const unzipDirPath = path.join(currentUploadDir, unzipDirName);

            const folderExists = entries.some(e => e.isDirectory() && e.name === unzipDirName);
            if (folderExists) {
                console.log(`Skipping ZIP file because folder already exists: ${entry.name}`);
                continue;
            }

            console.log(`Unzipping: ${entry.name}`);
            try {
                await unzip(uploadPath, unzipDirPath);
                await batchCropRecursive(unzipDirPath, outputRoot, depth, context, progressLogger);
                await fs.remove(unzipDirPath);
            } catch (err) {
                console.error(`Error processing zip ${entry.name}:`, err.message);
            }
            continue;
        }

        // 3. Image
        if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (!VALID_EXT.includes(ext)) continue;

            if (await fs.pathExists(outputPath)) continue;

            await fs.ensureDir(path.dirname(outputPath));

            try {
                await runCropAgent(uploadPath, { outputOverride: outputPath });
                console.log(`Cropped: ${relativePath}`);
            } catch (err) {
                console.error(`Failed: ${relativePath}`, err.message);
                if (progressLogger && context.appName && context.variantName) {
                    progressLogger.markVariantFailed(context.appName, context.variantName, err.message);
                    await progressLogger.save();
                }
            }
        }
    }

    // If we are at the end of a variant directory (flat structure case)
    if (depth === 2 && context.appName && context.variantName === "default" && folderContainsImages && progressLogger) {
        progressLogger.markVariantCompleted(context.appName, context.variantName);
        await progressLogger.save();
    }
}
