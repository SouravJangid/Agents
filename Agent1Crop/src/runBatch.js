import { batchCropRecursive } from "./batch/batchCrop.js";

import { runCropAgent } from "./agent/cropAgent.js";

async function start() {
    const args = process.argv.slice(2);
    const singleFile = args[0];

    if (singleFile) {
        console.log(`Processing single file: ${singleFile}`);
        const output = args[1] || singleFile.replace("signup_temp", "output_temp");
        await runCropAgent(singleFile, { outputOverride: output });
        console.log(`Finished: ${output}`);
        return;
    }

    console.log("Starting Agent1Crop (Batch Crop)...");
    const startTime = Date.now();
    await batchCropRecursive();
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.log(`Batch Crop complete in ${duration} seconds.`);
}

start().catch(err => console.error("Agent1Crop Error:", err));
