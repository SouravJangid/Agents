import { createWorker } from 'tesseract.js';
import { isMatch } from '../utils/normalizationUtils.js';
import { detectDesign } from '../utils/designDetector.js';

export async function performOCR(imagePath, keywords, languages = 'eng') {
    const worker = await createWorker(languages);

    // console.log(`Analyzing: ${imagePath}`);
    // In Tesseract.js v6/v7, words array is not at the top level by default.
    // We must request blocks and then extract words from the hierarchy.
    const { data } = await worker.recognize(imagePath, {}, { blocks: true });

    if (!data || !data.blocks) {
        console.error("OCR returned no data or blocks array is missing.");
        await worker.terminate();
        return { matches: [], all_words: [] };
    }

    // Flatten words from the blocks -> paragraphs -> lines hierarchy
    const words = [];
    data.blocks.forEach(block => {
        if (block.paragraphs) {
            block.paragraphs.forEach(para => {
                if (para.lines) {
                    para.lines.forEach(line => {
                        if (line.words) {
                            words.push(...line.words);
                        }
                    });
                }
            });
        }
    });

    const matches = [];
    const allWords = words.map(w => w.text);

    /*
    // 1. Line-level matching (High recall for multi-word keywords)
    for (const block of data.blocks) {
        if (!block.paragraphs) continue;
        for (const para of block.paragraphs) {
            if (!para.lines) continue;
            for (const line of para.lines) {
                for (const keyword of keywords) {
                    const matchInfo = isMatch(line.text, keyword);
                    if (matchInfo.match) {
                        const lineConfidence = line.words?.length > 0
                            ? line.words.reduce((sum, w) => sum + w.confidence, 0) / line.words.length
                            : 0;

                        const design = await detectDesign(imagePath, line.bbox);

                        matches.push({
                            keyword: keyword,
                            matched_text: line.text,
                            match_type: matchInfo.type,
                            confidence: lineConfidence / 100,
                            bbox: line.bbox,
                            design: design
                        });
                    }
                }
            }
        }
    }
    */

    // 2. Word-level matching (Precision for specific words)
    for (const word of words) {
        for (const keyword of keywords) {
            const matchInfo = isMatch(word.text, keyword);

            if (matchInfo.match) {
                const design = await detectDesign(imagePath, word.bbox);
                matches.push({
                    keyword: keyword,
                    matched_text: word.text,
                    match_type: matchInfo.type,
                    confidence: word.confidence / 100,
                    bbox: word.bbox,
                    design: design
                });
            }
        }
    }

    await worker.terminate();

    // De-duplicate matches based on keyword and identical bounding box
    const uniqueMatches = [];
    const seen = new Set();

    for (const m of matches) {
        const bboxKey = m.bbox
            ? `${m.bbox.x0},${m.bbox.y0},${m.bbox.x1},${m.bbox.y1}`
            : Math.random().toString();
        const key = `${m.keyword.toLowerCase()}|${bboxKey}`;

        if (!seen.has(key)) {
            seen.add(key);
            uniqueMatches.push(m);
        }
    }

    return {
        matches: uniqueMatches,
        all_words: allWords
    };
}
