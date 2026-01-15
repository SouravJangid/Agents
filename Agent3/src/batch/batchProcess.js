import fs from 'fs-extra';
import path from 'path';
import { processImageReplacement } from '../services/imageService.js';

export async function runAgent3Batch(config, progressLogger = null) {
    const indexPath = config.paths.indexFile;
    const sourceDir = config.paths.sourceDir;

    if (!await fs.pathExists(indexPath)) {
        throw new Error(`Index file not found: ${indexPath}`);
    }

    const index = await fs.readJson(indexPath);

    // Working Output Directory
    const workingDir = config.paths.workingDir;
    const workingImagesReplacedDir = path.join(workingDir, 'images_replaced');
    const workingImagesRemovedDir = path.join(workingDir, 'images_removed');

    // Final Output Directory
    const finalDir = config.paths.finalDir;
    await fs.ensureDir(finalDir);
    await fs.ensureDir(workingImagesReplacedDir);
    await fs.ensureDir(workingImagesRemovedDir);

    console.log(`Starting Agent3 Processing...`);
    console.log(`Source Dir: ${sourceDir}`);
    console.log(`Final Dir: ${finalDir}`);

    const results = {
        processed_files: []
    };

    // Use absolute path as lookup key for total accuracy
    const detectionsByPath = {};

    for (const keyword in index) {
        if (keyword === 'processed_files') continue;
        const kwData = index[keyword];
        if (!kwData.platforms) continue;

        for (const platform in kwData.platforms) {
            const platformData = kwData.platforms[platform];
            for (const appId in platformData.apps) {
                const appData = platformData.apps[appId];
                const variants = appData.outputs ? appData.outputs.variants : appData.variants;
                for (const variantId in variants) {
                    for (const imgData of variants[variantId]) {
                        const absPath = imgData["full_path"];
                        if (!absPath) continue;
                        if (!detectionsByPath[absPath]) detectionsByPath[absPath] = [];
                        detectionsByPath[absPath].push(...imgData.detections);
                    }
                }
            }
        }
    }

    const VALID_EXT = ['.png', '.jpg', '.jpeg', '.webp'];

    async function processDirectoryRecursively(currentDir, depth = 0, context = { appName: null, variantName: null }) {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        const hasImages = entries.some(e => e.isFile() && VALID_EXT.includes(path.extname(e.name).toLowerCase()));

        // Fallback for flat structures
        if (depth === 2 && hasImages && !context.variantName && progressLogger) {
            context.variantName = "default";
            if (progressLogger.isVariantCompleted(context.appName, context.variantName)) {
                console.log(`Skipping completed Agent3 Variant: ${context.appName}/${context.variantName}`);
                return;
            }
            progressLogger.markVariantStarted(context.appName, context.variantName);
            await progressLogger.save();
        }

        for (const entry of entries) {
            const imagePath = path.join(currentDir, entry.name);
            let newContext = { ...context };

            if (entry.isDirectory()) {
                if (depth === 1) {
                    newContext.appName = entry.name;
                    if (progressLogger && progressLogger.isAppCompleted(newContext.appName)) {
                        console.log(`Skipping completed Agent3 App: ${newContext.appName}`);
                        continue;
                    }
                    if (progressLogger) {
                        progressLogger.markAppStarted(newContext.appName);
                        await progressLogger.save();
                    }
                } else if (depth === 2) {
                    newContext.variantName = entry.name;
                    if (progressLogger && progressLogger.isVariantCompleted(newContext.appName, newContext.variantName)) {
                        console.log(`Skipping completed Agent3 Variant: ${newContext.appName}/${newContext.variantName}`);
                        continue;
                    }
                    if (progressLogger) {
                        progressLogger.markVariantStarted(newContext.appName, newContext.variantName);
                        await progressLogger.save();
                    }
                }

                await processDirectoryRecursively(imagePath, depth + 1, newContext);

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

            if (entry.isFile() && VALID_EXT.includes(path.extname(entry.name).toLowerCase())) {
                const imgName = entry.name;
                const relativePath = path.relative(sourceDir, imagePath);
                const finalPath = path.join(finalDir, imgName);

                if (await fs.pathExists(finalPath)) {
                    // Skip if file already exists in final output
                    continue;
                }

                console.log(`Agent3 Processing: ${imgName}`);

                // Lookup by absolute path (matches index)
                const detections = detectionsByPath[imagePath] || [];

                try {
                    if (detections.length > 0) {
                        const result = await processImageReplacement(imagePath, detections, config);
                        if (result) {
                            const removedWorkPath = path.join(workingImagesRemovedDir, relativePath);
                            const replacedWorkPath = path.join(workingImagesReplacedDir, relativePath);

                            await fs.ensureDir(path.dirname(removedWorkPath));
                            await fs.ensureDir(path.dirname(replacedWorkPath));

                            await fs.writeFile(removedWorkPath, result.inpainted);
                            await fs.writeFile(replacedWorkPath, result.replaced);
                            await fs.writeFile(finalPath, result.replaced);

                            results.processed_files.push({
                                filename: imgName,
                                relative_path: relativePath,
                                status: "replaced",
                                detections_count: detections.length
                            });
                            continue;
                        }
                    }

                    // Unchanged image
                    await fs.copy(imagePath, finalPath);
                    results.processed_files.push({
                        filename: imgName,
                        relative_path: relativePath,
                        status: "unchanged",
                        detections_count: detections.length
                    });

                } catch (err) {
                    console.error(`Failed: ${imgName}`, err.message);
                    if (progressLogger && context.appName && context.variantName) {
                        progressLogger.markVariantFailed(context.appName, context.variantName, err.message);
                        await progressLogger.save();
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

    await processDirectoryRecursively(sourceDir);

    await fs.outputJson(path.join(workingDir, 'run_summary.json'), results, { spaces: 2 });

    console.log(`\nAgent3 Batch complete.`);
}
