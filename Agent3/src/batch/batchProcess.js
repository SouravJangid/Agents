import fs from 'fs-extra';
import path from 'path';
import { processImageReplacement } from '../services/imageService.js';

export async function runAgent3Batch(config) {
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

    // Flatten detections for easy lookup by image name
    const detectionsByImage = {};

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
                        const imgName = imgData["images "];
                        if (!detectionsByImage[imgName]) detectionsByImage[imgName] = [];
                        detectionsByImage[imgName].push(...imgData.detections);
                    }
                }
            }
        }
    }

    // Now iterate over ALL images in the source directory
    const VALID_EXT = ['.png', '.jpg', '.jpeg', '.webp'];
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.isFile() && VALID_EXT.includes(path.extname(entry.name).toLowerCase())) {
            const imgName = entry.name;
            const imagePath = path.join(sourceDir, imgName);
            const finalPath = path.join(finalDir, imgName);

            console.log(`Processing: ${imgName}`);

            const detections = detectionsByImage[imgName] || [];

            try {
                if (detections.length > 0) {
                    const result = await processImageReplacement(imagePath, detections, config);
                    if (result) {
                        // Changed image
                        await fs.writeFile(path.join(workingImagesRemovedDir, imgName), result.inpainted);
                        await fs.writeFile(path.join(workingImagesReplacedDir, imgName), result.replaced);
                        await fs.writeFile(finalPath, result.replaced);

                        results.processed_files.push({
                            filename: imgName,
                            status: "replaced",
                            detections_count: detections.length
                        });
                        continue;
                    }
                }

                // Unchanged image (either no detections or no targetWord in detections)
                await fs.copy(imagePath, finalPath);
                results.processed_files.push({
                    filename: imgName,
                    status: "unchanged",
                    detections_count: detections.length
                });

            } catch (err) {
                console.error(`Failed to process ${imgName}:`, err.message);
                results.processed_files.push({
                    filename: imgName,
                    status: "error",
                    error: err.message
                });
            }
        }
    }

    await fs.outputJson(path.join(workingDir, 'run_summary.json'), results, { spaces: 2 });

    console.log(`\nAgent3 Batch complete.`);
    console.log(`All images (changed and unchanged) saved to: ${finalDir}`);
}
