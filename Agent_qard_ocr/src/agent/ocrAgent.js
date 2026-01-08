import path from 'path';
import { performOCR } from '../services/ocrService.js';
import { isMatch } from '../utils/normalizationUtils.js';

export async function runOcrAgent(imagePath, config) {
    const { keywords } = config.ocr;
    const { matches, all_words } = await performOCR(imagePath, keywords, config.ocr.languages);

    const hasAnyMatch = matches.length > 0;
    const strongMatches = [...new Set(matches
        .filter(m => m.confidence > 0.8)
        .map(m => m.keyword.toLowerCase()))];

    const weakMatches = [...new Set(matches
        .filter(m => m.confidence <= 0.8)
        .map(m => m.keyword.toLowerCase()))];

    const highestConfidence = matches.length > 0
        ? Math.max(...matches.map(m => m.confidence))
        : 0;

    const fileDir = path.dirname(imagePath);
    // const folderName = path.basename(fileDir);
    const imageName = path.basename(imagePath);

    return {
        filedir: fileDir,
        imagename: imageName,
        ocr_ran: true,
        status: hasAnyMatch ? "matched" : "no_match",
        // date: new Date().toISOString().split('T')[0],
        all_words,
        keywordMatches: matches,
        // summary: {
        //     has_any_match: hasAnyMatch,
        //     strong_matches: strongMatches,
        //     weak_matches: weakMatches,
        //     highest_confidence: highestConfidence
        // }
    };
}
