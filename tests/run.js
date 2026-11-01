// Runs every tests/*.test.js and every examples/*/test.js in its own node process. Exit 1 on any failure.
const fs = require("fs"), path = require("path"), { spawnSync } = require("child_process");
const root = path.join(__dirname, "..");
const files = [];
for (const f of fs.readdirSync(__dirname).sort()) if (f.endsWith(".test.js")) files.push(path.join(__dirname, f));
const ex = path.join(root, "examples");
if (fs.existsSync(ex)) for (const d of fs.readdirSync(ex).sort()) {
  const t = path.join(ex, d, "test.js");
  if (fs.existsSync(t)) files.push(t);
}
let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [f], { encoding: "utf8" });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${path.relative(root, f)}`);
  if (!ok || process.argv.includes("-v")) process.stdout.write((r.stdout || "") + (r.stderr || ""));
}
console.log(`${files.length} test files, ${failed} failed`);
process.exit(failed ? 1 : 0);
