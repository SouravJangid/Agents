import fs from "fs-extra";
import path from "path";
import { runCropAgent } from "../agent/cropAgent.js";
import { unzip } from "../utils/zipUtils.js";


/**
 * Recursively traverses the upload directory to find and process images.
 * It identifies the hierarchy as: Platform -> App (Depth 1) -> Variant (Depth 2) -> Images.
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

    // Determine if this directory directly contains images (indicates a Variant folder)
    const folderContainsImages = entries.some(e => e.isFile() && validExt.includes(path.extname(e.name).toLowerCase()));

    // Fallback: If images are found directly in an App folder, treat it as a "default" variant
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
        const relativePath = path.relative(uploadRoot, uploadPath);
        const outputPath = path.join(outputRoot, relativePath);

        let newContext = { ...context };

        // --- 1. Handle Subdirectories ---
        if (entry.isDirectory()) {
            if (depth === 1) {
                // We've found an App folder (e.g. "Airbnb")
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
                // We've found a Variant folder (e.g. "ios Jun 2023")
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

            // Ensure output directory mirrors the source structure
            await fs.ensureDir(outputPath);
            // Recurse deeper into the directory tree
            await batchCropRecursive(uploadPath, outputRoot, depth + 1, newContext, progressLogger, activeConfig);

            // Mark completion in logs after recursion finishes
            if (depth === 2 && newContext.appName && newContext.variantName && progressLogger) {
                progressLogger.markVariantCompleted(newContext.appName, newContext.variantName);
                await progressLogger.save();
            } else if (depth === 1 && newContext.appName && progressLogger) {
                progressLogger.markAppCompleted(newContext.appName);
                await progressLogger.save();
            }

            continue;
        }

        // --- 2. Handle ZIP Archives ---
        if (entry.isFile() && path.extname(entry.name).toLowerCase() === zipExt) {
            const unzipDirName = entry.name.replace(new RegExp(zipExt + '$', 'i'), "");
            const unzipDirPath = path.join(currentUploadDir, unzipDirName);

            // Avoid unzipping if the target folder already exists (prevents infinite loops/redundancy)
            const folderExists = entries.some(e => e.isDirectory() && e.name === unzipDirName);
            if (folderExists) {
                console.log(`Skipping ZIP file because folder already exists: ${entry.name}`);
                continue;
            }

            console.log(`Unzipping archive: ${entry.name}`);
            try {
                await unzip(uploadPath, unzipDirPath);
                await batchCropRecursive(unzipDirPath, outputRoot, depth, context, progressLogger, activeConfig);
                await fs.remove(unzipDirPath); // Clean up unzip folder after processing
            } catch (err) {
                console.error(`Error processing zip ${entry.name}:`, err.message);
                if (progressLogger) {
                    await progressLogger.logError(err, { ...context, action: 'unzip', zipPath: uploadPath });
                }
            }
            continue;
        }

        // --- 3. Handle Single Images ---
        if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (!validExt.includes(ext)) continue; // Skip non-image files

            // Resume check: Skip if already processed by this agent
            if (progressLogger && progressLogger.isImageProcessed(uploadPath)) {
                continue;
            }

            await fs.ensureDir(path.dirname(outputPath));

            try {
                // Call the Crop Agent to process the individual image
                await runCropAgent(uploadPath, { outputOverride: outputPath });
                console.log(`Successfully Cropped: ${relativePath}`);

                // Success log for resumption
                if (progressLogger) {
                    progressLogger.markImageProcessed(uploadPath);
                    await progressLogger.save();
                }
            } catch (err) {
                console.error(`Crop Failed: ${relativePath}`, err.message);
                if (progressLogger) {
                    progressLogger.markImageFailed(uploadPath, err.message);
                    await progressLogger.logError(err, { ...context, action: 'crop', imagePath: uploadPath });
                }
            }
        }
    }

    // Completion check for flat structure (no Variant folder, just App/Images)
    if (depth === 2 && context.appName && context.variantName === "default" && folderContainsImages && progressLogger) {
        progressLogger.markVariantCompleted(context.appName, context.variantName);
        await progressLogger.save();
    }
}
