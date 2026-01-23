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
    const detectionsByPath = {};
    let totalDetectionsInIndex = 0;

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
                        let relPath = imgData["relative_path"];
                        if (!relPath) continue;

                        // --- OPTION A: NORMALIZATION ---
                        // Strip 'latest/' prefix if present to match the source folder's relative structure
                        if (relPath.startsWith('latest/')) {
                            relPath = relPath.substring(7); // Remove 'latest/'
                        }

                        if (!detectionsByPath[relPath]) detectionsByPath[relPath] = [];
                        detectionsByPath[relPath].push(...imgData.detections);
                        totalDetectionsInIndex += imgData.detections.length;
                    }
                }
            }
        }
    }

    console.log(`📊 Index Loaded: ${Object.keys(detectionsByPath).length} unique image paths found.`);
    console.log(`📊 Total individual detections to blur: ${totalDetectionsInIndex}`);

    // DEBUG: Print first 3 keys to verify path structure
    const sampleKeys = Object.keys(detectionsByPath).slice(0, 3);
    console.log("🔍 DEBUG - Normalized Index Path Samples:", JSON.stringify(sampleKeys, null, 2));

    const VALID_EXT = ['.png', '.jpg', '.jpeg', '.webp'];

    let hasLoggedSample = false;
    let imagesProcessedCount = 0;
    const stats = { total: 0, blurred: 0, copied: 0 };

    /**
     * Recursive function to maintain folder structure while processing images.
     */
    async function processDirectoryRecursively(currentSrcDir, depth = 0, context = { appName: null, variantName: null }) {
        const entries = await fs.readdir(currentSrcDir, { withFileTypes: true });
        for (const entry of entries) {
            // --- 0. SKIP HIDDEN FILES (macOS ._ and .DS_Store) and other system files ---
            if (entry.name.startsWith('.') || entry.name.startsWith('._') || entry.name === '__MACOSX') {
                continue;
            }

            const fullPath = path.join(currentSrcDir, entry.name);
            const relativePath = path.relative(sourceDir, fullPath);

            if (!hasLoggedSample && entry.isFile() && VALID_EXT.includes(path.extname(entry.name).toLowerCase())) {
                console.log(`🔍 DEBUG - Current File Sample Path: "${relativePath}"`);
                hasLoggedSample = true;
            }

            const destinationPath = path.join(finalDir, relativePath);

            // --- A. Handle Directories ---
            if (entry.isDirectory()) {
                // Depth tracking helps identify which App we are in for logging
                let newContext = { ...context };
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

                await fs.ensureDir(destinationPath);
                await processDirectoryRecursively(fullPath, depth + 1, newContext);

                // Mark Completion
                if (progressLogger && depth === 1) {
                    progressLogger.markAppCompleted(newContext.appName);
                    await progressLogger.save();
                }
                continue;
            }

            // --- B. Handle Image Files ---
            if (entry.isFile() && VALID_EXT.includes(path.extname(entry.name).toLowerCase())) {
                const detections = detectionsByPath[relativePath] || [];

                // --- DEEP DEBUG ---
                if (detections.length === 0) {
                    // console.log(`ℹ️ No index match for: ${relativePath}`);
                } else {
                    console.log(`🎯 Match found! ${relativePath} has ${detections.length} detections.`);
                }

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
                            stats.blurred++;
                            imagesProcessedCount++;
                            console.log(`[${imagesProcessedCount}] ✅ Blurred & Saved: ${relativePath}`);

                            if (progressLogger) {
                                progressLogger.markImageProcessed(fullPath);
                                await progressLogger.save();
                            }

                            if (imagesProcessedCount % 100 === 0) {
                                console.log(`\n⏳ Progress Update: Processed ${imagesProcessedCount} images...`);
                                console.log(`📈 Stats: ${stats.blurred} Blurred, ${stats.copied} Copied As-Is\n`);
                            }
                            continue;
                        }
                    }

                    // For images without matches, we just copy them as-is to the final output
                    await fs.copy(fullPath, destinationPath);
                    stats.copied++;
                    imagesProcessedCount++;

                    if (imagesProcessedCount % 100 === 0) {
                        console.log(`\n⏳ Progress Update: Processed ${imagesProcessedCount} images...`);
                        console.log(`📈 Stats: ${stats.blurred} Blurred, ${stats.copied} Copied As-Is\n`);
                    }

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
