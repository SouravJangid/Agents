import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';

/**
 * Agent 3: Image Blurring Service.
 * This service takes detection coordinates from Agent 2 and applies a blur effect 
 * to those specific regions to hide the targeted keywords.
 */
export async function processImageBlur(imagePath, detections, config) {
    // 1. Get the target keyword from the configuration
    // This allows us to only blur the specific words the user wants to hide
    const { targetWord } = config.replacement;

    // 2. Wrap the source image in a Sharp instance
    // Sharp is used for all high-performance image manipulation tasks
    let img = sharp(imagePath);

    // 3. Retrieve image metadata (width/height)
    // We need these dimensions to ensure our blur regions don't go outside the image borders
    const metadata = await img.metadata();

    // 4. Initialize an array to store all blurring (composite) operations
    // We will apply all blurs in a single batch at the end for efficiency
    const compositeOperations = [];

    // 5. Loop through every word detection provided by Agent 2
    for (const detection of detections) {
        // Skip this detection if it doesn't contain our target keyword (case-insensitive)
        if (!detection.text.toLowerCase().includes(targetWord.toLowerCase())) {
            console.log(`  ⏩ Skipping detection: "${detection.text}" (does not match targetWord: "${targetWord}")`);
            continue;
        }

        console.log(`  🔥 BLURRING: "${detection.text}" at ${JSON.stringify(detection.bbox_refined)}`);

        // Extract the refined bounding box (the exact coordinates of the word)
        const { bbox_refined } = detection;
        if (!bbox_refined) continue;

        const { x, y, w, h } = bbox_refined;

        // 6. Calculate the blur region with a small amount of padding (2px)
        // Padding ensures we fully cover the visual footprint of the characters
        // We use Math.round to ensure pixel-perfect coordinates
        const bx = Math.max(0, Math.round(x - 2));
        const by = Math.max(0, Math.round(y - 2));
        const bw = Math.min(metadata.width - bx, Math.round(w + 4));
        const bh = Math.min(metadata.height - by, Math.round(h + 4));

        // 7. Create a blurred "patch" of the image
        // We extract the small rectangle, apply a Gaussian blur, and convert it to a buffer
        const blurredPatch = await sharp(imagePath)
            .extract({ left: bx, top: by, width: bw, height: bh })
            .blur(15) // Apply a strong blur (intensity = 15)
            .toBuffer();

        // 8. Add this blurred patch to our list of overlays
        // We'll place this patch exactly back where we took it from
        compositeOperations.push({
            input: blurredPatch,
            left: bx,
            top: by
        });
    }

    // 9. If no matching keywords were found, return null
    if (compositeOperations.length === 0) return null;

    // 10. Perform the final composite operation
    // This pastes all blurred patches back onto the original image in one go
    const blurredBuffer = await img
        .composite(compositeOperations)
        .png()
        .toBuffer();

    // 11. Return the result object
    // 'replaced' is used by the batch processor to save the final redacted image
    return {
        replaced: blurredBuffer,
        inpainted: blurredBuffer // For consistency with existing pipeline structure
    };
}
