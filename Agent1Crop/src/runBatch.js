import fs from "fs-extra";
import path from "path";
import { batchCropRecursive } from "./batch/batchCrop.js";
import { runCropAgent } from "./agent/cropAgent.js";
import { ProgressLogger } from "./utils/progressLogger.js";

// Initialize logger for this agent
const progressLogger = new ProgressLogger('Agent1Crop');

async function start() {
    const cwd = process.cwd();

    // 1. Load Local Config (This agent's own settings)
    const configPath = path.resolve(cwd, 'config.json');
    if (!await fs.pathExists(configPath)) {
        throw new Error(`Config file not found: ${configPath}`);
    }
    const config = await fs.readJson(configPath);
    console.log("✅ Using local Agent1Crop configuration.");

    // 2. Define Routing based on local config
    const uploadDir = path.resolve(cwd, config.paths.uploadDir);
    const outputRootDir = path.resolve(cwd, config.paths.outputDir);
    const latestOutputDir = path.join(outputRootDir, "latest");

    const args = process.argv.slice(2);
    const singleFile = args[0];

    // Initialize/Load progress logs
    await progressLogger.init();
    progressLogger.setupSystemListeners();

    if (singleFile) {
        console.log(`Processing single file: ${singleFile}`);
        const output = args[1] || singleFile.replace("signup_temp", "output_temp");
        await runCropAgent(singleFile, { outputOverride: output });
        console.log(`Finished: ${output}`);
        return;
    }

    await fs.ensureDir(latestOutputDir);

    console.log("Starting Agent1Crop (Batch Crop Mode)...");
    console.log(`Source Directory: ${uploadDir}`);
    console.log(`Output Directory: ${latestOutputDir}`);

    const startTime = Date.now();

    try {
        await progressLogger.addRunEntry({ action: "start_batch" });
        // Pass the local config for processing settings (crop profiles)
        await batchCropRecursive(uploadDir, latestOutputDir, 0, { appName: null, variantName: null }, progressLogger, config);
        await progressLogger.addRunEntry({ action: "complete_batch", status: "success" });
        await progressLogger.save(); // Force sync to legacy JSON
    } catch (err) {
        console.error("Batch processing failed:", err.message);
        await progressLogger.logError(err, { action: "complete_batch" });
        await progressLogger.addRunEntry({ action: "complete_batch", status: "failed", error: err.message });
        await progressLogger.save(); // Force sync to legacy JSON
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.log(`Batch Crop complete in ${duration} seconds.`);
}

start().catch(async err => {
    console.error("Agent1Crop Fatal Error:", err);
    await progressLogger.logError(err, { action: "fatal_initialization" });
});
