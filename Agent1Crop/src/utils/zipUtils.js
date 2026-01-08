import AdmZip from "adm-zip";

export function unzip(zipPath, extractTo) {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractTo, true);
}

export function zipFolder(sourceDir, outputZipPath) {
    const zip = new AdmZip();
    zip.addLocalFolder(sourceDir);
    zip.writeZip(outputZipPath);
}