import { execa } from 'execa';
import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs-extra';

const __dirname = path.resolve();

// Load Config
const configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
    console.error("Master config.json not found!");
    process.exit(1);
}
const config = fs.readJsonSync(configPath);

// Paths
const UPLOAD_DIR = path.resolve(config.paths.uploadDir);
const AGENT1_DIR = path.resolve(__dirname, config.paths.agent1Dir);
const AGENT_OCR_DIR = path.resolve(__dirname, config.paths.agentOcrDir);

async function runCrop() {
    console.log("\n--- Running Agent1Crop ---");
    try {
        await execa('npm', ['start'], { cwd: AGENT1_DIR, stdio: 'inherit' });
    } catch (err) {
        console.error("Agent1Crop failed:", err.message);
    }
}

async function runOCR() {
    console.log("\n--- Running Agent_qard_ocr ---");
    try {
        await execa('npm', ['start'], { cwd: AGENT_OCR_DIR, stdio: 'inherit' });
    } catch (err) {
        console.error("Agent_qard_ocr failed:", err.message);
    }
}

async function runFullPipeline() {
    console.log("\n🚀 Starting Full Agent Pipeline...");
    const start = Date.now();

    await runCrop();
    await runOCR();

    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`\n✅ Pipeline complete in ${duration}s`);
}

// Check for watch flag
const isWatch = process.argv.includes('--watch');

if (isWatch) {
    console.log(`\n👀 Watching for changes in: ${UPLOAD_DIR}`);

    // Initial run
    runFullPipeline();

    const watcher = chokidar.watch(UPLOAD_DIR, {
        persistent: true,
        ignoreInitial: true,
        depth: config.settings.watchDepth || 5
    });

    let timeout;
    watcher.on('all', (event, filePath) => {
        console.log(`\n🔔 Change detected: [${event}] ${filePath}`);

        // Debounce to avoid multiple triggers for batch copies
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            runFullPipeline();
        }, config.settings.watchDebounceMs || 1000);
    });
} else {
    runFullPipeline();
}
