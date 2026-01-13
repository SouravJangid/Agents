import fs from 'fs-extra';
import path from 'path';

/**
 * Manages the App-Level Keyword Index with Platform/AppId/VariantId nesting.
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

export async function updateKeywordIndex(indexPath, result, keywords, config) {
    let index = {};

    if (await fs.pathExists(indexPath)) {
        index = await fs.readJson(indexPath);
    }

    const sourceDir = path.resolve(process.cwd(), config.paths.sourceDir);
    const platform = getPlatformFromPath(result.filedir, sourceDir);
    const folderName = path.basename(result.filedir);

    // If the folder is the sourceDir itself, use a generic name or from relative path
    const effectiveFolderName = (result.filedir === sourceDir) ? "outputs" : folderName;
    const { appId, variantId } = parseFolderName(effectiveFolderName);
    const fullPath = path.resolve(result.filedir, result.imagename);

    // Process each keyword match found in the image
    result.keywordMatches.forEach(match => {
        const kw = match.keyword.toLowerCase();

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

        // Structure: platforms -> platform -> apps -> appId -> variants -> variantId -> [images]
        if (!index[kw].platforms[platform].apps[appId]) {
            index[kw].platforms[platform].apps[appId] = { "variants": {} };
        }

        if (!index[kw].platforms[platform].apps[appId].variants[variantId]) {
            index[kw].platforms[platform].apps[appId].variants[variantId] = [];
        }

        const variantList = index[kw].platforms[platform].apps[appId].variants[variantId];
        let existingEntry = variantList.find(img => img["images "] === result.imagename);

        if (!existingEntry) {
            index[kw]["total number of matching"] += 1;
            existingEntry = {
                "images ": result.imagename,
                "full_path": fullPath,
                "highest_confidence": "0.00",
                "detections": [],
                "matched_as": ""
            };
            variantList.push(existingEntry);
        }

        // Update highest confidence and matched_as if this match is stronger
        const currentConf = parseFloat(match.confidence.toFixed(2));
        if (currentConf > parseFloat(existingEntry.highest_confidence)) {
            existingEntry.highest_confidence = match.confidence.toFixed(2);
            existingEntry.matched_as = match.matched_text.trim();
        }

        // Add this detection to the list
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
            } : null,
            "design": match.design
        });
    });

    await fs.outputJson(indexPath, index, { spaces: 2 });
}

export async function initializeIndex(indexPath) {
    if (!(await fs.pathExists(indexPath))) {
        await fs.outputJson(indexPath, {}, { spaces: 2 });
    }
}
