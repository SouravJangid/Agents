import fs from "fs";
import path from "path";
import { batchCropRecursive } from "./batch/batchCrop.js";
import { runCropAgent } from "./agent/cropAgent.js";

async function start() {
    const configPath = path.resolve(process.cwd(), "config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

    const args = process.argv.slice(2);
    const singleFile = args[0];

    if (singleFile) {
        console.log(`Processing single file: ${singleFile}`);
        const output = args[1] || singleFile.replace("signup_temp", "output_temp");
        await runCropAgent(singleFile, { outputOverride: output });
        console.log(`Finished: ${output}`);
        return;
    }

    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const timestamp = istDate.toISOString().replace('Z', '').replace(/[:.]/g, '-') + '-IST';
    const timestampedOutputDir = path.resolve(process.cwd(), config.paths.outputDir, timestamp);

    if (!fs.existsSync(timestampedOutputDir)) {
        fs.mkdirSync(timestampedOutputDir, { recursive: true });
    }

    console.log("Starting Agent1Crop (Batch Crop)...");
    console.log(`Output Directory: ${timestampedOutputDir}`);

    const startTime = Date.now();
    await batchCropRecursive(undefined, timestampedOutputDir);
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.log(`Batch Crop complete in ${duration} seconds.`);
}

start().catch(err => console.error("Agent1Crop Error:", err));
