import sharp from 'sharp';
import fs from 'fs-extra';
import path from 'path';

/**
 * Replaces text in an image based on detection data and design style.
 * Returns both the inpainted (removed) and final (replaced) buffers.
 */
export async function processImageReplacement(imagePath, detections, config) {
    const { targetWord, newWord } = config.replacement;
    let currentImage = sharp(imagePath);
    const metadata = await currentImage.metadata();

    const inpaintLayers = [];
    const textLayers = [];

    // Expansion padding (requested 5px width and height)
    const paddingX = 2.5;
    const paddingY = 2.5;

    for (const detection of detections) {
        if (!detection.text.toLowerCase().includes(targetWord.toLowerCase())) continue;

        const { bbox_refined, design } = detection;
        if (!bbox_refined || !design) continue;

        const { x, y, w, h } = bbox_refined;
        const { textColor, bgColor, fontSize, weight, isGradient, bgTop, bgBottom } = design;

        // Expanded coordinates to ensure no text artifacts are left behind
        const ex = x - paddingX;
        const ey = y - paddingY;
        const ew = w + (paddingX * 2);
        const eh = h + (paddingY * 2);

        // 1. Inpaint Layer (Rectangle)
        if (isGradient) {
            const id = `grad_${x}_${y}`;
            inpaintLayers.push(`
                <defs>
                    <linearGradient id="${id}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:${bgTop};stop-opacity:1" />
                        <stop offset="100%" style="stop-color:${bgBottom};stop-opacity:1" />
                    </linearGradient>
                </defs>
                <rect x="${ex}" y="${ey}" width="${ew}" height="${eh}" fill="url(#${id})" />
            `);
        } else {
            inpaintLayers.push(`<rect x="${ex}" y="${ey}" width="${ew}" height="${eh}" fill="${bgColor}" />`);
        }

        // 2. Text Layer
        const replacedText = detection.text.replace(new RegExp(targetWord, 'gi'), newWord);
        textLayers.push(`
            <text 
                x="${x + w / 2}" 
                y="${y + h / 2}" 
                font-family="Arial, Helvetica, sans-serif" 
                font-size="${fontSize}" 
                font-weight="${weight || 'normal'}" 
                fill="${textColor}" 
                text-anchor="middle" 
                dominant-baseline="central"
            >${escapeHtml(replacedText)}</text>
        `);
    }

    if (inpaintLayers.length === 0) return null;

    // Create Inpainted Buffer
    const svgInpaint = `<svg width="${metadata.width}" height="${metadata.height}" xmlns="http://www.w3.org/2000/svg">${inpaintLayers.join('\n')}</svg>`;
    const inpaintedBuffer = await sharp(imagePath)
        .composite([{ input: Buffer.from(svgInpaint), top: 0, left: 0 }])
        .png({ compressionLevel: 0, effort: 1, palette: false })
        .toBuffer();

    // Create Final Replaced Buffer
    const svgFinal = `<svg width="${metadata.width}" height="${metadata.height}" xmlns="http://www.w3.org/2000/svg">
        ${inpaintLayers.join('\n')}
        ${textLayers.join('\n')}
    </svg>`;
    const replacedBuffer = await sharp(imagePath)
        .composite([{ input: Buffer.from(svgFinal), top: 0, left: 0 }])
        .png({ compressionLevel: 0, effort: 1, palette: false })
        .toBuffer();

    return {
        inpainted: inpaintedBuffer,
        replaced: replacedBuffer
    };
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
