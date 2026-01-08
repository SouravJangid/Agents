import path from "path";
import fs from "fs";
import sharp from "sharp";
import { processImage } from "../services/imageService.js";

const config = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "config.json"), "utf-8"));

/**
 * Main agent entry
 * - Decides crop profile (mobile vs desktop)
 * - Delegates actual image work to service
 */
export async function runCropAgent(inputPath, options = {}) {
    // Read metadata once (cheap, reliable)
    const metadata = await sharp(inputPath).metadata();

    // Decide which crop profile to use
    const cropProfile = getCropProfile(metadata);

    // Force output to the configured format
    const outputExt = `.${config.processing.outputFormat || 'png'}`;
    const outputPath = options.outputOverride
        ? options.outputOverride.replace(/\.[^.]+$/, outputExt)
        : defaultOutputPath(inputPath);

    // Execute crop + conversion
    await processImage(inputPath, outputPath, cropProfile);

    return {
        outputPath,
        profile: cropProfile.type
    };
}

/**
 * Decide whether image is mobile or desktop
 * based purely on aspect ratio
 */
function getCropProfile(metadata) {
    const aspectRatio = metadata.height / metadata.width;
    const { mobile, desktop } = config.profiles;
    const quality = config.processing.quality;

    // Mobile screens are tall
    if (aspectRatio > mobile.aspectRatioThreshold) {
        return {
            type: "mobile",
            bottomCropPercent: mobile.bottomCropPercent,
            quality
        };
    }

    // Desktop screens are wide
    return {
        type: "desktop",
        bottomCropPercent: desktop.bottomCropPercent,
        quality
    };
}

/**
 * Fallback output path if none provided
 */
function defaultOutputPath(inputPath) {
    const outputExt = `.${config.processing.outputFormat || 'png'}`;
    const fileName = path.basename(inputPath).replace(/\.[^.]+$/, outputExt);
    return path.join(config.paths.outputDir, fileName);
}
