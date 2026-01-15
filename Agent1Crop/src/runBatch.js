import fs from "fs-extra";
import path from "path";
import { batchCropRecursive } from "./batch/batchCrop.js";
import { runCropAgent } from "./agent/cropAgent.js";
import { ProgressLogger } from "./utils/progressLogger.js";

// Initialize logger for this agent
const progressLogger = new ProgressLogger('Agent1Crop');

async function start() {
    const configPath = path.resolve(process.cwd(), "config.json");
    const config = await fs.readJson(configPath);

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

    // Output Management: Maintain only the latest data
    const outputRootDir = path.resolve(process.cwd(), config.paths.outputDir);
    const latestOutputDir = path.join(outputRootDir, "latest");
    await fs.ensureDir(latestOutputDir);

    console.log("Starting Agent1Crop (Batch Crop)...");
    console.log(`Output Directory: ${latestOutputDir}`);

    const startTime = Date.now();

    try {
        await progressLogger.addRunEntry({ action: "start_batch" });
        await batchCropRecursive(undefined, latestOutputDir, 0, { appName: null, variantName: null }, progressLogger);
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
