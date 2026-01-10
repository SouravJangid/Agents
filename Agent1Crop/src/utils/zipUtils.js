import fs from "fs";
import AdmZip from "adm-zip";

/**
 * Basic ZIP signature check (PK\x03\x04)
 */
function isZipFile(zipPath) {
    const fd = fs.openSync(zipPath, "r");
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);

    return buffer.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
}

export function unzip(zipPath, extractTo) {
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

        const zip = new AdmZip(zipPath);
        zip.extractAllTo(extractTo, true);

        console.log("[UNZIP OK]", zipPath);

    } catch (err) {
        console.error("\n[UNZIP FAILED]");
        console.error("  File:", zipPath);
        console.error("  Reason:", err.message);
        console.error("  Stack:", err.stack);

        // rethrow so batch logic can decide what to do
        throw err;
    }
}

export function zipFolder(sourceDir, outputZipPath) {
    console.log(
        "\n[ZIP CREATE]",
        "\n  Source:", sourceDir,
        "\n  Output:", outputZipPath
    );

    const zip = new AdmZip();
    zip.addLocalFolder(sourceDir);
    zip.writeZip(outputZipPath);

    const stat = fs.statSync(outputZipPath);
    console.log("[ZIP CREATED]", outputZipPath, "size:", stat.size);
}
