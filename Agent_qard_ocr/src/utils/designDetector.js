import { execSync } from 'child_process';
import path from 'path';

/**
 * Enhanced design detector using OpenCV via Python.
 */
export async function detectDesign(imagePath, bbox) {
    try {
        if (!bbox) return null;

        const { x0, y0, x1, y1 } = bbox;

        // Call the Python OpenCV script
        const scriptPath = path.resolve(process.cwd(), 'src/utils/cv_design_detector.py');
        const command = `python3 "${scriptPath}" "${imagePath}" ${x0} ${y0} ${x1} ${y1}`;

        const output = execSync(command, { encoding: 'utf8' });
        const result = JSON.parse(output);

        if (result.error) {
            console.error("OpenCV Detection Error:", result.error);
            return null;
        }

        return result;
    } catch (err) {
        console.error("Design detection bridge failed:", err.message);
        return null;
    }
}
