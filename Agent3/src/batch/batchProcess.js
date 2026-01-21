import fs from 'fs-extra';
import path from 'path';
import { processImageBlur } from '../services/imageService.js';

/**
 * Executes a batch processing run for Agent 3.
 * Iterates through the detection index and applies blurring to target images.
 */
export async function runAgent3Batch(config, progressLogger = null) {
    // 1. Resolve Paths from Configuration
    const indexPath = config.paths.indexFile;
    const sourceDir = config.paths.sourceDir;
    const finalDir = config.paths.finalDir;
    const workingDir = config.paths.workingDir;

    // 2. Load the Keyword Index (metadata from Agent 2)
    if (!await fs.pathExists(indexPath)) {
        throw new Error(`Index file not found: ${indexPath}`);
    }
    const index = await fs.readJson(indexPath);

    // 3. Prepare Output Directories
    // We create separate folders for blurred images and temporary working copies
    const workingImagesDir = path.join(workingDir, 'processed_images');
    await fs.ensureDir(finalDir);
    await fs.ensureDir(workingImagesDir);

    console.log(`Starting Agent3 Batch Processing (Blur Mode)...`);

    // 4. Map Detections by Image Path
    // The index is organized by Keyword; we need it organized by File Path for efficient processing
    const detectionsByPath = {};
    for (const keyword in index) {
        const kwData = index[keyword];
        if (!kwData.platforms) continue;

        for (const platform in kwData.platforms) {
            const platformData = kwData.platforms[platform];
            for (const appId in platformData.apps) {
                const appData = platformData.apps[appId];
                const variants = appData.variants;
                for (const variantId in variants) {
                    for (const imgData of variants[variantId]) {
                        const relPath = imgData["relative_path"];
                        if (!relPath) continue;
                        if (!detectionsByPath[relPath]) detectionsByPath[relPath] = [];
                        // Store detected coordinates for this specific image
                        detectionsByPath[relPath].push(...imgData.detections);
                    }
                }
            }
        }
    }

    const VALID_EXT = ['.png', '.jpg', '.jpeg', '.webp'];

    /**
     * Recursive function to maintain folder structure while processing images.
     */
    async function processDirectoryRecursively(currentSrcDir, depth = 0, context = { appName: null, variantName: null }) {
        const entries = await fs.readdir(currentSrcDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentSrcDir, entry.name);
            const relativePath = path.relative(sourceDir, fullPath);
            const destinationPath = path.join(finalDir, relativePath);

            // --- A. Handle Directories ---
            if (entry.isDirectory()) {
                // Depth tracking helps identify which App/Variant we are in for logging
                let newContext = { ...context };
                if (depth === 1) newContext.appName = entry.name;
                if (depth === 2) newContext.variantName = entry.name;

                await fs.ensureDir(destinationPath);
                await processDirectoryRecursively(fullPath, depth + 1, newContext);
                continue;
            }

            // --- B. Handle Image Files ---
            if (entry.isFile() && VALID_EXT.includes(path.extname(entry.name).toLowerCase())) {
                const detections = detectionsByPath[relativePath] || [];

                // Resume check: Skip if already processed by Agent 3
                if (progressLogger && progressLogger.isImageProcessed(fullPath)) {
                    continue;
                }

                try {
                    // Only process images that have detected keywords
                    if (detections.length > 0) {
                        // Call the Blur Service
                        const result = await processImageBlur(fullPath, detections, config);

                        if (result) {
                            // Save the blurred result to the final delivery directory
                            await fs.writeFile(destinationPath, result.replaced);
                            console.log(`✅ Blurred: ${relativePath}`);

                            if (progressLogger) {
                                progressLogger.markImageProcessed(fullPath);
                                await progressLogger.save();
                            }
                            continue;
                        }
                    }

                    // For images without matches, we just copy them as-is to the final output
                    await fs.copy(fullPath, destinationPath);

                    if (progressLogger) {
                        progressLogger.markImageProcessed(fullPath);
                        await progressLogger.save();
                    }
                } catch (err) {
                    console.error(`❌ Failed to process ${entry.name}:`, err.message);
                    if (progressLogger) {
                        progressLogger.markImageFailed(fullPath, err.message);
                        await progressLogger.logError(err, { ...context, action: 'blur', imagePath: fullPath });
                    }
                }
            }
        }
    }

    // Start the recursive traversal
    await processDirectoryRecursively(sourceDir);

    console.log(`\nAgent3 Batch complete. Results available in: ${finalDir}`);
}
