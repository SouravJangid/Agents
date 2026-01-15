import fs from 'fs-extra';
import path from 'path';

const LOGS_DIR = './logs/index';
const APPS_FILE = path.join(LOGS_DIR, 'apps.json');
const VARIANTS_FILE = path.join(LOGS_DIR, 'variants.json');
const RUNS_FILE = path.join(LOGS_DIR, 'runs.json');

async function showStatus() {
    if (!await fs.pathExists(APPS_FILE)) {
        console.log("No logs found. Run an agent first.");
        return;
    }

    const apps = await fs.readJson(APPS_FILE);
    const variants = await fs.readJson(VARIANTS_FILE);
    const runs = await fs.readJson(RUNS_FILE);

    console.log("\n========================================");
    console.log("       EDUQARD AGENT STATUS REPORT");
    console.log("========================================\n");

    const agents = ['Agent1Crop', 'Agent_qard_ocr', 'Agent3'];

    for (const agent of agents) {
        console.log(`\n🔍 AGENT: ${agent}`);
        console.log("----------------------------------------");

        const agentApps = Object.entries(apps).filter(([key]) => key.startsWith(`${agent}:`));

        if (agentApps.length === 0) {
            console.log("  No data recorded.");
            continue;
        }

        agentApps.forEach(([key, data]) => {
            const appName = key.split(':')[1];
            const statusIcon = data.status === 'completed' ? '✅' : data.status === 'running' ? '⏳' : '❌';
            console.log(`  ${statusIcon} App: ${appName.padEnd(30)} | ${data.status.toUpperCase()}`);

            // Show variants for this app
            const agentVariants = Object.entries(variants).filter(([vKey]) => vKey.startsWith(`${agent}:${appName}/`));
            agentVariants.forEach(([vKey, vData]) => {
                const variantName = vKey.split('/')[1];
                const vStatusIcon = vData.status === 'completed' ? '  └─ ✅' : vData.status === 'running' ? '  └─ ⏳' : '  └─ ❌';
                console.log(`     ${vStatusIcon} Variant: ${variantName.padEnd(24)} | ${vData.status.toUpperCase()}`);
            });
        });
    }

    console.log("\n----------------------------------------");
    console.log("✨ LATEST RUNS (Last 10)");
    runs.slice(-10).reverse().forEach(run => {
        const icon = run.status === 'success' ? '✅' : run.status === 'failed' ? '❌' : '⏳';
        const agentName = (run.agent || 'Unknown').padEnd(15);
        const actionName = (run.action || 'Unknown').padEnd(15);
        console.log(`  [${run.timestamp.slice(0, 19)}] ${icon} ${agentName} | ${actionName} | ${run.status || 'started'}`);
    });
    console.log("========================================\n");
}

showStatus().catch(err => console.error(err));
