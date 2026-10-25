#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const skipSeed = args.has("--skip-seed");
const help = args.has("--help") || args.has("-h");
const unknown = [...args].filter((arg) => !["--skip-seed", "--help", "-h"].includes(arg));

if (help || unknown.length > 0) {
  if (unknown.length > 0) {
    console.error(`Unknown option(s): ${unknown.join(", ")}`);
  }
  console.log("Usage: npm run deploy:demo [-- --skip-seed]");
  console.log("");
  console.log("Deploys the Convex backend, then seeds the production/demo deployment.");
  console.log("Use --skip-seed to deploy without replacing demo data.");
  process.exit(unknown.length > 0 ? 1 : 0);
}

function run(label, command, commandArgs) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, commandArgs, { stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("Deploy Convex backend", "npx", ["convex", "deploy"]);

if (!skipSeed) {
  console.warn("\nWarning: the production seed wipes and recreates the demo app data.");
  run("Seed demo deployment", "npx", ["convex", "run", "seedActions:baseAndIngest", "{}", "--prod"]);
}

console.log("\nDemo deployment complete.");
