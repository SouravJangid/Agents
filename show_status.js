import fs from 'fs-extra';
import path from 'path';

async function showStatus() {
    const rootConfigPath = path.resolve(process.cwd(), './config.json');
    if (!await fs.pathExists(rootConfigPath)) {
        console.error("Root config.json not found!");
        return;
    }
    const rootConfig = await fs.readJson(rootConfigPath);

    const logsDir = path.resolve(process.cwd(), rootConfig.pipeline.logsDir, 'index');
    const appsFile = path.join(logsDir, 'apps.json');
    const variantsFile = path.join(logsDir, 'variants.json');
    const runsFile = path.join(logsDir, 'runs.json');

    if (!await fs.pathExists(appsFile)) {
        console.log("No logs found. Run an agent first.");
        return;
    }

    const apps = await fs.readJson(appsFile);
    const variants = await fs.readJson(variantsFile);
    const runs = await fs.readJson(runsFile);

    console.log("\n========================================");
    console.log("       EDUQARD AGENT STATUS REPORT");
    console.log("========================================\n");

    const agents = ['Agent1Crop', 'Agent_qard_ocr', 'Agent3'];

    for (const agent of agents) {
        console.log(`\n🔍 AGENT: ${agent}`);
        console.log("----------------------------------------");

        const agentApps = Object.entries(apps)
            .filter(([key]) => key.startsWith(`${agent}:`))
            .sort((a, b) => a[0].localeCompare(b[0]));

        if (agentApps.length === 0) {
            console.log("  No data recorded.");
            continue;
        }

        agentApps.forEach(([key, data]) => {
            const appName = key.split(':').slice(1).join(':');
            const statusIcon = data.status === 'completed' ? '✅' : data.status === 'running' ? '⏳' : '❌';
            console.log(`  ${statusIcon} App: ${appName.padEnd(30)} | ${data.status.toUpperCase()}`);

            // Show variants for this app
            const agentVariants = Object.entries(variants)
                .filter(([vKey]) => vKey.startsWith(`${agent}:${appName}/`))
                .sort((a, b) => a[0].localeCompare(b[0]));

            agentVariants.forEach(([vKey, vData]) => {
                const variantName = vKey.split('/').slice(1).join('/');
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
