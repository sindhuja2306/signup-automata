const fs = require("fs");
const path = require("path");

/** @typedef {{ phone: string, timestamp: string, status: string, error?: string, screenshot?: string }} Result */

/** @type {Result[]} */
const results =
    fs.existsSync(path.join(__dirname, "../results/results.json"))
        ? /** @type {Result[]} */ (JSON.parse(
            fs.readFileSync(
                path.join(__dirname, "../results/results.json"),
                "utf8"
            )
        ))
        : [];

const header =
    "Phone,Timestamp,Status,Error,Screenshot\n";

const rows = results.map((item) => {

    return [
        item.phone,
        item.timestamp,
        item.status,
        item.error,
        item.screenshot
    ].map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",");

}).join("\n");

const reportPath = path.join(__dirname, "../results/results.csv");

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(
    reportPath,
    header + rows + (rows ? "\n" : ""),
    "utf8"
);

const successful =
    results.filter(
        (x) => x.status === "SUCCESS" || x.status === "SUBMITTED"
    ).length;

const failed =
    results.filter(
        (x) => x.status === "FAILED"
    ).length;

console.log("\n========== REPORT ==========");
console.log(`Total:      ${results.length}`);
console.log(`Successful: ${successful}`);
console.log(`Failed:     ${failed}`);

console.log(
    `Success %:  ${
        (results.length === 0 ? 0 : (successful / results.length) * 100)
        .toFixed(2)
    }%`
);

console.log("============================");
