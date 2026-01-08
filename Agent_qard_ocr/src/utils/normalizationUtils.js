/**
 * Normalizes text for better OCR matching.
 * Handles common OCR errors and formatting issues.
 */
export function normalizeText(text) {
    if (!text) return "";

    return text
        .toLowerCase()
        // Replace common OCR character misreads (Visual Normalization)
        .replace(/0/g, 'o')  // zero to o
        .replace(/1/g, 'i')  // one to i
        .replace(/l/g, 'i')  // lower l to i 
        .replace(/5/g, 's')  // 5 to s
        // Remove everything except alphanumeric
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

/**
 * Checks if a candidate text matches a keyword after normalization.
 * Incorporates fuzzy matching logic.
 */
export function isMatch(candidate, keyword) {
    const normalizedCandidate = normalizeText(candidate);
    const normalizedKeyword = normalizeText(keyword);

    // 1. Direct match
    if (normalizedCandidate === normalizedKeyword) return { match: true, type: "exact" };

    // 2. Substring match (e.g., mobbin inside www.mobbin.com)
    if (normalizedCandidate.includes(normalizedKeyword)) return { match: true, type: "partial" };

    return { match: false };
}
