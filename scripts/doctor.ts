import { parseArgs } from "node:util";
import { sqlite } from "../db/client.ts";
import { runDiagnostics, type Status } from "../lib/diagnostics/doctor.ts";

const SYMBOL: Record<Status, string> = { ok: "ok  ", warn: "warn", fail: "FAIL" };

async function main(): Promise<number> {
    const { values } = parseArgs({
        options: { json: { type: "boolean", default: false } },
    });
    const checks = await runDiagnostics();
    if (values.json) {
        console.log(JSON.stringify({ checks }, null, 2));
    } else {
        const width = Math.max(...checks.map((check) => check.name.length));
        for (const check of checks) {
            console.log(`${SYMBOL[check.status]}  ${check.name.padEnd(width)}  ${check.detail}`);
        }
    }
    const failed = checks.filter((check) => check.status === "fail").length;
    if (failed > 0) {
        console.error(`\n${failed} check(s) failed.`);
        return 1;
    }
    return 0;
}

const code = await main();
sqlite.close();
process.exit(code);