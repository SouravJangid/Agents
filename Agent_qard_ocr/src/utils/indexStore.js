import fs from 'fs-extra';
import path from 'path';

/**
 * Parses folder names into App ID and Variant ID.
 * Example: "Airbnb ios Jun 2023" -> { appId: "Airbnb", variantId: "ios Jun 2023" }
 */
function parseFolderName(folderName) {
    const platformMatch = folderName.match(/^(.+?)\s+(ios|android|web|desktop)\s+(.+)$/i);
    if (platformMatch) {
        return {
            appId: platformMatch[1].trim(),
            variantId: `${platformMatch[2]} ${platformMatch[3]}`.trim()
        };
    }

    const parts = folderName.split(' ');
    if (parts.length > 1) {
        return {
            appId: parts[0],
            variantId: parts.slice(1).join(' ')
        };
    }

    return {
        appId: folderName,
        variantId: "default"
    };
}

/**
 * Determines the platform (mobile/web/desktop) based on the directory structure.
 */
function getPlatformFromPath(filedir, sourceDir) {
    const relative = path.relative(sourceDir, filedir);
    if (!relative || relative === '.') return "other";

    const parts = relative.split(path.sep);
    const platform = parts[0].toLowerCase();

    if (['mobile', 'web', 'desktop'].includes(platform)) {
        return platform;
    }

    return "other";
}

/**
 * Core function to update the indexing.json file with new OCR results.
 * Organizes data as: Keyword -> Platform -> App -> Variant -> Images.
 */
export async function updateKeywordIndex(indexPath, result, keywords, config) {
    let index = {};

    // 1. Load existing index if it exists
    if (await fs.pathExists(indexPath)) {
        index = await fs.readJson(indexPath);
    }

    const sourceDir = path.resolve(process.cwd(), config.paths.sourceDir);
    const platform = getPlatformFromPath(result.filedir, sourceDir);
    const folderName = path.basename(result.filedir);

    // 2. Identify App and Variant context
    const effectiveFolderName = (result.filedir === sourceDir) ? "outputs" : folderName;
    const { appId, variantId } = parseFolderName(effectiveFolderName);
    const fullPath = path.resolve(result.filedir, result.imagename);

    // 3. Process each keyword match found in the current image
    result.keywordMatches.forEach(match => {
        const kw = match.keyword.toLowerCase();

        // Initialize structure if missing
        if (!index[kw]) {
            index[kw] = {
                "keyword": match.keyword,
                "total number of matching": 0,
                "platforms": {}
            };
        }

        if (!index[kw].platforms[platform]) {
            index[kw].platforms[platform] = { "apps": {} };
        }

        if (!index[kw].platforms[platform].apps[appId]) {
            index[kw].platforms[platform].apps[appId] = { "variants": {} };
        }

        if (!index[kw].platforms[platform].apps[appId].variants[variantId]) {
            index[kw].platforms[platform].apps[appId].variants[variantId] = [];
        }

        const variantList = index[kw].platforms[platform].apps[appId].variants[variantId];
        let existingEntry = variantList.find(img => img["images "] === result.imagename);

        // 4. Create new image entry if it doesn't exist for this keyword
        if (!existingEntry) {
            index[kw]["total number of matching"] += 1;
            existingEntry = {
                "images ": result.imagename,
                "relative_path": path.relative(sourceDir, fullPath),
                "highest_confidence": "0.00",
                "detections": [],
                "matched_as": ""
            };
            variantList.push(existingEntry);
        }

        // 5. Update global image stats (highest confidence match)
        const currentConf = parseFloat(match.confidence.toFixed(2));
        if (currentConf > parseFloat(existingEntry.highest_confidence)) {
            existingEntry.highest_confidence = match.confidence.toFixed(2);
            existingEntry.matched_as = match.matched_text.trim();
        }

        // 6. Record the specific detection coordinates
        // We only save the text and the Refined Bounding Box (bbox_refined)
        existingEntry.detections.push({
            "text": match.matched_text.trim(),
            "confidence": match.confidence.toFixed(2),
            "bbox_refined": match.bbox ? {
                "x": Math.round(match.bbox.x0),
                "y": Math.round(match.bbox.y0),
                "w": Math.round(match.bbox.x1 - match.bbox.x0),
                "h": Math.round(match.bbox.y1 - match.bbox.y0),
                "x0": Math.round(match.bbox.x0),
                "y0": Math.round(match.bbox.y0),
                "x1": Math.round(match.bbox.x1),
                "y1": Math.round(match.bbox.y1)
            } : null
        });
    });

    // 7. Write updated index back to disk
    await fs.outputJson(indexPath, index, { spaces: 2 });
}

/**
 * Ensures the index file exists before starting the batch.
 */
export async function initializeIndex(indexPath) {
    if (!(await fs.pathExists(indexPath))) {
        await fs.outputJson(indexPath, {}, { spaces: 2 });
    }
}
