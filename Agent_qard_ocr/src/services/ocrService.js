import { createWorker } from 'tesseract.js';
import { isMatch } from '../utils/normalizationUtils.js';

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

    // 1. Line-level matching (High recall for multi-word keywords)
    data.blocks.forEach(block => {
        block.paragraphs?.forEach(para => {
            para.lines?.forEach(line => {
                for (const keyword of keywords) {
                    const matchInfo = isMatch(line.text, keyword);
                    if (matchInfo.match) {
                        // Calculate average confidence for the line
                        const lineConfidence = line.words?.length > 0
                            ? line.words.reduce((sum, w) => sum + w.confidence, 0) / line.words.length
                            : 0;

                        // Only add if not already matched in this exact line to avoid duplicates
                        matches.push({
                            keyword: keyword,
                            matched_text: line.text,
                            match_type: matchInfo.type,
                            confidence: lineConfidence / 100,
                        });
                    }
                }
            });
        });
    });

    // 2. Word-level matching (Precision for specific words)
    // We only add if the keyword wasn't already caught at the line level for this position,
    // but since we are just building a list for the index, duplicates are handled by the indexer anyway.
    for (const word of words) {
        for (const keyword of keywords) {
            const matchInfo = isMatch(word.text, keyword);

            if (matchInfo.match) {
                // To avoid double-counting the EXACT same word/image combo in the same run,
                // the indexer already handles "alreadyIndexed" check.
                matches.push({
                    keyword: keyword,
                    matched_text: word.text,
                    match_type: matchInfo.type,
                    confidence: word.confidence / 100,
                });
            }
        }
    }

    await worker.terminate();

    return {
        matches,
        all_words: allWords
    };
}
