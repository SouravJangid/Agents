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
            const unzipDirName = entry.name.replace(ZIP_EXT, "");
            const unzipDirPath = path.join(currentUploadDir, unzipDirName);

            // Check if a directory with the same name already exists to avoid double-processing
            const folderExists = entries.some(e => e.isDirectory() && e.name === unzipDirName);
            if (folderExists) {
                console.log(`Skipping ZIP file because folder already exists: ${entry.name}`);
                continue;
            }

            if (!fs.existsSync(unzipDirPath)) {
                unzip(uploadPath, unzipDirPath);
            }

            // Process extracted content
            await batchCropRecursive(unzipDirPath, {
                unzipDir: unzipDirPath,
                zipName: unzipDirName,
                relativeBase: path.relative(UPLOAD_ROOT, unzipDirPath)
            });

            // Re-zip cropped output
            const croppedFolder = path.join(OUTPUT_ROOT, path.relative(UPLOAD_ROOT, unzipDirPath));
            const outputZipPath = path.join(OUTPUT_ROOT, relativePath);

            console.log(`Zipping result: ${outputZipPath}`);
            zipFolder(croppedFolder, outputZipPath);

            // Cleanup: Remove the unzipped folders from UPLOAD and OUTPUT directories
            try {
                fs.rmSync(unzipDirPath, { recursive: true, force: true }); // UPLOAD cleanup
                fs.rmSync(croppedFolder, { recursive: true, force: true }); // OUTPUT cleanup
                console.log(`Cleaned up temporary folders for: ${unzipDirName}`);
            } catch (err) {
                console.error(`Cleanup failed: ${err.message}`);
            }
            continue;
        }

        // 3. Image
        if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (!VALID_EXT.includes(ext)) continue;

            // Skip if output already exists (Resume feature)
            if (fs.existsSync(outputPath)) {
                // console.log(`Skipping (already cropped): ${relativePath}`);
                continue;
            }

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
