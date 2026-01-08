import fs from "fs";
import path from "path";
import { runCropAgent } from "../agent/cropAgent.js";
import { unzip, zipFolder } from "../utils/zipUtils.js";

const config = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "config.json"), "utf-8"));

const UPLOAD_ROOT = path.resolve(process.cwd(), config.paths.uploadDir);
const OUTPUT_ROOT = path.resolve(process.cwd(), config.paths.outputDir);
const VALID_EXT = config.processing.validExtensions;
const ZIP_EXT = ".zip";

export async function batchCropRecursive(
    currentUploadDir = UPLOAD_ROOT,
    zipContext = null
) {
    const entries = fs.readdirSync(currentUploadDir, {
        withFileTypes: true
    });

    for (const entry of entries) {
        const uploadPath = path.join(currentUploadDir, entry.name);
        const relativePath = path.relative(UPLOAD_ROOT, uploadPath);
        const outputPath = path.join(OUTPUT_ROOT, relativePath);

        // 1. Directory
        if (entry.isDirectory()) {
            fs.mkdirSync(outputPath, { recursive: true });
            await batchCropRecursive(uploadPath, zipContext);
            continue;
        }

        // 2. ZIP file
        if (entry.isFile() && path.extname(entry.name) === ZIP_EXT) {
            const unzipDir = uploadPath.replace(ZIP_EXT, "");
            const zipName = path.basename(unzipDir);

            if (!fs.existsSync(unzipDir)) {
                unzip(uploadPath, unzipDir);
            }

            // Process extracted content
            await batchCropRecursive(unzipDir, {
                unzipDir,
                zipName,
                relativeBase: path.relative(UPLOAD_ROOT, unzipDir)
            });

            // Re-zip cropped output
            const croppedFolder = path.join(
                OUTPUT_ROOT,
                path.relative(UPLOAD_ROOT, unzipDir)
            );

            const outputZipPath = path.join(
                OUTPUT_ROOT,
                `${path.relative(UPLOAD_ROOT, uploadPath)}`
            );

            zipFolder(croppedFolder, outputZipPath);

            console.log(`Recompressed: ${outputZipPath}`);
            continue;
        }

        // 3. Image
        if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (!VALID_EXT.includes(ext)) continue;

            fs.mkdirSync(path.dirname(outputPath), { recursive: true });

            try {
                await runCropAgent(uploadPath, {
                    outputOverride: outputPath
                });

                console.log(`Cropped: ${relativePath}`);
            } catch (err) {
                console.error(`Failed: ${relativePath}`, err.message);
            }
        }
    }
}
