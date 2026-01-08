import fs from 'fs-extra';
import path from 'path';
import { runOcrAgent } from '../agent/ocrAgent.js';
import { updateKeywordIndex } from '../utils/indexStore.js';

const VALID_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

export async function processDirectoryRecursive(dir, config, processedFiles) {
    let entries = await fs.readdir(dir, { withFileTypes: true });

    // Sort entries to process folders and files in a predictable order
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            await processDirectoryRecursive(fullPath, config, processedFiles);
        } else if (entry.isFile()) {
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

                    await updateKeywordIndex(indexFile, result, config.ocr.keywords);

                    const uniqueKeywords = [...new Set(result.keywordMatches.map(m => m.keyword))];
                    console.log(`Matched keywords: ${uniqueKeywords.join(', ') || 'none'}`);
                } catch (err) {
                    console.error(`Error processing ${fullPath}:`, err.message);
                }
            }
        }
    }
}
