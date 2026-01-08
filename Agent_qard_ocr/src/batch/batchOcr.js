import fs from 'fs-extra';
import path from 'path';
import { runOcrAgent } from '../agent/ocrAgent.js';
import { updateKeywordIndex } from '../utils/indexStore.js';
import { unzip } from '../utils/zipUtils.js';

const VALID_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const ZIP_EXT = '.zip';

export async function processDirectoryRecursive(dir, config, processedFiles) {
    let entries = await fs.readdir(dir, { withFileTypes: true });

    // Sort entries to process folders and files in a predictable order
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // 1. Directory
        if (entry.isDirectory()) {
            await processDirectoryRecursive(fullPath, config, processedFiles);
            continue;
        }

        // 2. ZIP file (New feature)
        if (entry.isFile() && path.extname(entry.name).toLowerCase() === ZIP_EXT) {
            const folderName = entry.name.slice(0, -ZIP_EXT.length);
            const tempUnzipDir = path.join(dir, folderName);

            // Check if a directory with the same name already exists to avoid double-processing
            // AND to prevent accidental deletion of existing data at the end of the block.
            const folderExists = entries.some(e => e.isDirectory() && e.name === folderName);
            if (folderExists) {
                console.log(`Skipping ZIP file because folder already exists: ${entry.name}`);
                continue;
            }

            console.log(`Unzipping for OCR: ${entry.name}`);
            try {
                unzip(fullPath, tempUnzipDir);
                // Process the unzipped contents
                await processDirectoryRecursive(tempUnzipDir, config, processedFiles);
                // Cleanup temp folder (Safe because we checked folderExists)
                await fs.remove(tempUnzipDir);
                console.log(`Cleaned up temporary OCR folder: ${tempUnzipDir}`);
            } catch (err) {
                console.error(`Error processing ZIP ${entry.name}:`, err.message);
                if (await fs.pathExists(tempUnzipDir)) await fs.remove(tempUnzipDir);
            }
            continue;
        }

        // 3. Image file
        if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (VALID_EXTENSIONS.includes(ext)) {
                // Skip if already processed
                if (processedFiles && processedFiles.has(fullPath)) {
                    console.log(`Skipping (already processed): ${fullPath}`);
                    continue;
                }

                console.log(`Processing: ${fullPath}`);
                try {
                    const result = await runOcrAgent(fullPath, config);
                    const indexFile = path.resolve(process.cwd(), config.paths.indexFile);

                    await updateKeywordIndex(indexFile, result, config.ocr.keywords, config);

                    const uniqueKeywords = [...new Set(result.keywordMatches.map(m => m.keyword))];
                    console.log(`Matched keywords: ${uniqueKeywords.join(', ') || 'none'}`);
                } catch (err) {
                    console.error(`Error processing ${fullPath}:`, err.message);
                }
            }
        }
    }
}
