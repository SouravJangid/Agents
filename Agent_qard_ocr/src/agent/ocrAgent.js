import path from 'path';
import { performOCR } from '../services/ocrService.js';

/**
 * Orchestrates the OCR process for a single image.
 * Acts as the bridge between the raw OCR service and the indexing system.
 */
export async function runOcrAgent(imagePath, config) {
    // 1. Extract settings from config
    const { keywords } = config.ocr;
    const languages = config.ocr.languages || 'eng';

    // 2. Run the OCR Service
    // This returns specific matches (bbox, text) and a list of all words found
    const { matches, all_words } = await performOCR(imagePath, keywords, languages);

    const hasAnyMatch = matches.length > 0;
    const fileDir = path.dirname(imagePath);
    const imageName = path.basename(imagePath);

    // 3. Construct the result payload
    // We provide the location of the file and the specific keyword matches found
    return {
        filedir: fileDir,           // Directory where the image is stored
        imagename: imageName,       // Filename of the image
        ocr_ran: true,              // Flag to indicate processing occurred
        status: hasAnyMatch ? "matched" : "no_match", // Quick status check
        all_words,                  // All text found in the image (for debugging)
        keywordMatches: matches     // Detailed objects containing: keyword, matched_text, confidence, and bbox
    };
}
