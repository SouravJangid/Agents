import sharp from "sharp";
import fs from "fs";
import path from "path";

// Disable sharp cache for large batch processing to prevent memory growth
sharp.cache(false);

/**
 * Crops bottom portion of image (percentage-based).
 * Performs a straight crop without adjusting quality settings.
 */
export async function processImage(
    inputPath,
    outputPath,
    options = {}
) {
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    const width = metadata.width;
    const height = metadata.height;

    // Bottom crop percentage comes from agent decision
    const bottomCropPercent = options.bottomCropPercent;
    const bottomCropPx = Math.floor(height * bottomCropPercent);

    // Crop everything ABOVE the footer region
    const cropRegion = {
        left: 0,
        top: 0,
        width,
        height: height - bottomCropPx
    };

    // Ensure output directory exists
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    // Extract regions and save directly to file
    // This performs the crop while maintaining standard format-specific defaults
    await image.extract(cropRegion).toFile(outputPath);

    return outputPath;
}
