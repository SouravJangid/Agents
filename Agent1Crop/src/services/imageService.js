import sharp from "sharp";
import fs from "fs";
import path from "path";

const config = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "config.json"), "utf-8"));

/**
 * Crops bottom portion of image (percentage-based)
 * and converts result to the configured format (e.g., PNG, WebP)
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

    let processor = image.extract(cropRegion);

    const format = config.processing.outputFormat?.toLowerCase() || 'png';

    if (format === 'png') {
        processor = processor.png({
            compressionLevel: config.processing.compressionLevel ?? 9,
            effort: config.processing.effort ?? 4
        });
    } else if (format === 'webp') {
        processor = processor.webp({
            quality: options.quality ?? config.processing.quality,
            effort: config.processing.effort ?? 4
        });
    } else if (format === 'jpg' || format === 'jpeg') {
        processor = processor.jpeg({
            quality: options.quality ?? config.processing.quality
        });
    }

    await processor.toFile(outputPath);

    return outputPath;
}
