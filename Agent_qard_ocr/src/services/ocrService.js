import path from 'path';
import { createWorker } from 'tesseract.js';
import { isMatch } from '../utils/normalizationUtils.js';

let sharedWorker = null;

export async function initWorker(languages = 'eng') {
    if (!sharedWorker) {
        sharedWorker = await createWorker(languages);
        console.log(`✅ Tesseract worker initialized.`);
    }
    return sharedWorker;
}

export async function terminateWorker() {
    if (sharedWorker) {
        await sharedWorker.terminate();
        sharedWorker = null;
    }
}

/**
 * Performs OCR and identifies keyword matches.
 * Uses getFullResult to ensure bboxes and words are populated.
 */
export async function performOCR(imagePath, keywords, languages = 'eng') {
    const worker = await initWorker(languages);

    // In Tesseract.js v5+, we request blocks to get the structural data (words, lines, etc.)
    const { data } = await worker.recognize(imagePath, {}, { blocks: true });

    if (!data) return { matches: [], all_words: [] };

    // Tesseract.js structure: data contains blocks, which contain paragraphs, then lines, then words.
    // We flatten this to get all words with their bboxes.
    const words = [];
    if (data.blocks) {
        data.blocks.forEach(block => {
            block.paragraphs.forEach(para => {
                para.lines.forEach(line => {
                    line.words.forEach(word => {
                        words.push(word);
                    });
                });
            });
        });
    }

    const matches = [];
    const allWordsText = words.map(w => w.text);

    console.log(`📸 OCR for ${path.basename(imagePath)}: ${words.length} words found.`);

    // --- Search Strategy ---
    // We check every word to see if it matches or contains our keyword
    for (const word of words) {
        for (const keyword of keywords) {
            const matchInfo = isMatch(word.text, keyword);
            if (matchInfo.match) {
                matches.push({
                    keyword: keyword,
                    matched_text: word.text,
                    confidence: word.confidence / 100,
                    bbox: word.bbox
                });
            }
        }
    }

    // Deduplication
    const uniqueMatches = [];
    const seen = new Set();
    for (const m of matches) {
        const key = `${m.keyword}|${Math.round(m.bbox.x0)},${Math.round(m.bbox.y0)}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueMatches.push(m);
        }
    }

    if (uniqueMatches.length > 0) {
        console.log(`✅ MATCH: Found "${keywords.join(', ')}" in ${path.basename(imagePath)}`);
    }

    return {
        matches: uniqueMatches,
        all_words: allWordsText
    };
}
