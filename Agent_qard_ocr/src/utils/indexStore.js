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
    const parts = relative.split(path.sep);

    // If the path is something like "mobile/App Name/Variant", the first part is the platform
    // We expect "mobile", "web", or "desktop"
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
    const folderName = result.filedir.split(path.sep).pop();
    const { appId, variantId } = parseFolderName(folderName);

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

        if (!index[kw].platforms[platform].apps[appId]) {
            index[kw].platforms[platform].apps[appId] = { "variants": {} };
        }

        if (!index[kw].platforms[platform].apps[appId].variants[variantId]) {
            index[kw].platforms[platform].apps[appId].variants[variantId] = [];
        }

        const variantList = index[kw].platforms[platform].apps[appId].variants[variantId];
        const existingEntry = variantList.find(img => img["images "] === result.imagename);

        if (existingEntry) {
            // If already indexed, check if this new match has higher confidence
            const newConf = parseFloat(match.confidence.toFixed(2));
            if (newConf > parseFloat(existingEntry.highest_confidence)) {
                existingEntry.highest_confidence = match.confidence.toFixed(2);
                existingEntry.matched_as = match.matched_text; // Prove normalization
            }
        } else {
            // New entry for this image
            index[kw]["total number of matching"] += 1;
            variantList.push({
                "images ": result.imagename,
                "highest_confidence": match.confidence.toFixed(2),
                "matched_as": match.matched_text // Prove normalization
            });
        }
    });

    await fs.outputJson(indexPath, index, { spaces: 2 });
}

export async function initializeIndex(indexPath) {
    if (!(await fs.pathExists(indexPath))) {
        await fs.outputJson(indexPath, {}, { spaces: 2 });
    }
}
