import fs from "fs-extra";
import path from "path";
import { batchCropRecursive } from "./batch/batchCrop.js";
import { runCropAgent } from "./agent/cropAgent.js";
import { ProgressLogger } from "./utils/progressLogger.js";

// Initialize logger for this agent
const progressLogger = new ProgressLogger('Agent1Crop');

async function start() {
    // 0. Detect Workspace Root
    const cwd = process.cwd();
    let workspaceRoot = path.resolve(cwd, "..");
    if (fs.existsSync(path.join(cwd, "config.json")) && !fs.existsSync(path.join(cwd, "src"))) {
        // If config.json exists here but no 'src', we might be in the root (legacy check)
        // But usually agents have src. The most reliable check is:
        if (fs.existsSync(path.join(cwd, "Agent1Crop"))) {
            workspaceRoot = cwd;
        }
    } else if (fs.existsSync(path.join(cwd, "../Agent1Crop"))) {
        workspaceRoot = path.resolve(cwd, "..");
    }

    // 1. Load Local Config (Always present)
    const localConfigPath = path.join(fs.existsSync(path.join(cwd, "config.json")) ? cwd : path.join(cwd, "Agent1Crop"), "config.json");
    // Actually, we usually run from the agent folder.
    const config = await fs.readJson(path.resolve(cwd, "config.json"));

    // 2. Load Root Config for Routing (Optional Override)
    const rootConfigPath = path.join(workspaceRoot, "config.json");
    let rootConfig = null;
    if (await fs.pathExists(rootConfigPath)) {
        rootConfig = await fs.readJson(rootConfigPath);
    }

    // 3. Define Routing: Root overrides Local
    const uploadDir = rootConfig
        ? path.resolve(workspaceRoot, rootConfig.pipeline.uploadDir)
        : path.resolve(workspaceRoot, config.paths.uploadDir);

    const workingRoot = rootConfig
        ? path.resolve(workspaceRoot, rootConfig.pipeline.workingDir)
        : path.resolve(workspaceRoot, config.paths.outputDir, "..");

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
    console.log(`Working Directory: ${workingRoot}`);
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
