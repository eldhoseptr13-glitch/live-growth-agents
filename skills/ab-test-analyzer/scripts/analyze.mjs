#!/usr/bin/env node
// CLI for the exact-stats experiment analyzer. Prints the markdown report.
// Usage: node scripts/analyze.mjs <input.json>   or   node scripts/analyze.mjs '{"testType":...}'
import { readFileSync } from "node:fs";
import { analyze } from "../lib/abtest.js";

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/analyze.mjs <input.json | inline JSON>\nSee SKILL.md for the input schema.');
  process.exit(1);
}
let input;
try {
  input = JSON.parse(arg.trim().startsWith("{") ? arg : readFileSync(arg, "utf8"));
} catch (e) {
  console.error("Could not parse input: " + e.message);
  process.exit(1);
}
console.log(analyze(input).output);
