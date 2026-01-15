import fs from "fs-extra";
import path from "path";
import { batchCropRecursive } from "./batch/batchCrop.js";
import { runCropAgent } from "./agent/cropAgent.js";
import { ProgressLogger } from "./utils/progressLogger.js";

// Initialize logger for this agent
const progressLogger = new ProgressLogger('Agent1Crop');

async function start() {
    // 1. Load Local Config (Always present)
    const localConfigPath = path.resolve(process.cwd(), "config.json");
    const config = await fs.readJson(localConfigPath);

    // 2. Load Root Config for Routing (Optional Override)
    const rootConfigPath = path.resolve(process.cwd(), "../config.json");
    let rootConfig = null;
    if (await fs.pathExists(rootConfigPath)) {
        rootConfig = await fs.readJson(rootConfigPath);
    }

    // 3. Define Routing: Root overrides Local
    const uploadDir = path.resolve(process.cwd(), rootConfig ? rootConfig.pipeline.uploadDir : config.paths.uploadDir);
    const workingRoot = path.resolve(process.cwd(), rootConfig ? rootConfig.pipeline.workingDir : "../OutputsDuringWorking");
    const outputRootDir = path.join(workingRoot, "Agent1Crop");
    const latestOutputDir = path.join(outputRootDir, "latest");

    const args = process.argv.slice(2);
    const singleFile = args[0];

    // Initialize/Load progress logs
    await progressLogger.init();

    if (singleFile) {
        console.log(`Processing single file: ${singleFile}`);
        const output = args[1] || singleFile.replace("signup_temp", "output_temp");
        await runCropAgent(singleFile, { outputOverride: output });
        console.log(`Finished: ${output}`);
        return;
    }

    await fs.ensureDir(latestOutputDir);

    console.log("Starting Agent1Crop (Batch Crop)...");
    console.log(`Source Directory: ${uploadDir}`);
    console.log(`Output Directory: ${latestOutputDir}`);

    const startTime = Date.now();

    try {
        await progressLogger.addRunEntry({ action: "start_batch" });
        await batchCropRecursive(uploadDir, latestOutputDir, 0, { appName: null, variantName: null }, progressLogger);
        await progressLogger.addRunEntry({ action: "complete_batch", status: "success" });
    } catch (err) {
        console.error("Batch processing failed:", err.message);
        await progressLogger.addRunEntry({ action: "complete_batch", status: "failed", error: err.message });
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.log(`Batch Crop complete in ${duration} seconds.`);
}

start().catch(err => console.error("Agent1Crop Error:", err));
