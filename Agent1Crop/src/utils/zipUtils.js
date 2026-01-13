import fs from "fs";
import path from "path";
import yauzl from "yauzl";
import yazl from "yazl";
import { pipeline } from "stream/promises";

/**
 * Basic ZIP signature check (PK\x03\x04)
 */
function isZipFile(zipPath) {
    try {
        const fd = fs.openSync(zipPath, "r");
        const buffer = Buffer.alloc(4);
        fs.readSync(fd, buffer, 0, 4, 0);
        fs.closeSync(fd);
        return buffer.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    } catch {
        return false;
    }
}

/**
 * Unzips a file using yauzl
 */
export async function unzip(zipPath, extractTo) {
    try {
        const stat = fs.statSync(zipPath);

        console.log(
            "\n[UNZIP START]",
            "\n  File:", zipPath,
            "\n  Size:", stat.size, "bytes"
        );

        if (stat.size === 0) {
            throw new Error("ZIP file is empty");
        }

        if (!isZipFile(zipPath)) {
            throw new Error("File does not have ZIP magic bytes");
        }

        return new Promise((resolve, reject) => {
            yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
                if (err) return reject(err);

                zipfile.readEntry();
                zipfile.on("entry", (entry) => {
                    const filePath = path.join(extractTo, entry.fileName);

                    if (/\/$/.test(entry.fileName)) {
                        // Directory entry
                        fs.mkdirSync(filePath, { recursive: true });
                        zipfile.readEntry();
                    } else {
                        // File entry
                        fs.mkdirSync(path.dirname(filePath), { recursive: true });
                        zipfile.openReadStream(entry, (err, readStream) => {
                            if (err) return reject(err);

                            const writeStream = fs.createWriteStream(filePath);
                            readStream.on("end", () => {
                                zipfile.readEntry();
                            });

                            readStream.on("error", (err) => reject(err));
                            writeStream.on("error", (err) => reject(err));

                            readStream.pipe(writeStream);
                        });
                    }
                });

                zipfile.on("end", () => {
                    console.log("[UNZIP OK]", zipPath);
                    resolve();
                });

                zipfile.on("error", (err) => {
                    reject(err);
                });
            });
        });

    } catch (err) {
        console.error("\n[UNZIP FAILED]");
        console.error("  File:", zipPath);
        console.error("  Reason:", err.message);
        console.error("  Stack:", err.stack);
        throw err;
    }
}

/**
 * Zips a folder using yazl
 */
export async function zipFolder(sourceDir, outputZipPath) {
    console.log(
        "\n[ZIP CREATE]",
        "\n  Source:", sourceDir,
        "\n  Output:", outputZipPath
    );

    const zipfile = new yazl.ZipFile();

    const addDirectory = (dir, zipDir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const entryZipPath = path.join(zipDir, entry.name);
            if (entry.isDirectory()) {
                addDirectory(fullPath, entryZipPath);
            } else {
                zipfile.addFile(fullPath, entryZipPath);
            }
        }
    };

    addDirectory(sourceDir, "");
    zipfile.end();

    const outputStream = fs.createWriteStream(outputZipPath);
    await pipeline(zipfile.outputStream, outputStream);

    const stat = fs.statSync(outputZipPath);
    console.log("[ZIP CREATED]", outputZipPath, "size:", stat.size);
}
