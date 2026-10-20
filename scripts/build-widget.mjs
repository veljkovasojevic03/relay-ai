#!/usr/bin/env node
// Builds the embeddable widget (widget/src) into public/widget.js and enforces the size
// budget from the spec: the build FAILS above 30 KB gzipped, so CI catches growth.
//
//   node scripts/build-widget.mjs          # one-off build (part of `pnpm build`)
//   node scripts/build-widget.mjs --watch  # rebuild on change while developing

import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

import * as esbuild from "esbuild";

const BUDGET_BYTES = 30 * 1024;
const OUTFILE = "public/widget.js";
const watch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: ["widget/src/index.ts"],
  outfile: OUTFILE,
  bundle: true,
  minify: true,
  format: "iife",
  // Evergreen browsers; shop visitors on old browsers simply don't get a widget.
  target: "es2020",
  legalComments: "none",
  logLevel: "warning",
};

function reportSize() {
  const gzipped = gzipSync(readFileSync(OUTFILE)).length;
  const kb = (gzipped / 1024).toFixed(1);
  if (gzipped > BUDGET_BYTES) {
    console.error(`✖ ${OUTFILE}: ${kb} KB gzipped, over the 30 KB budget`);
    return false;
  }
  console.log(`✓ ${OUTFILE}: ${kb} KB gzipped (budget 30 KB)`);
  return true;
}

if (watch) {
  const context = await esbuild.context({
    ...options,
    plugins: [{ name: "size", setup: (b) => b.onEnd((r) => r.errors.length || reportSize()) }],
  });
  await context.watch();
  console.log("Watching widget/src …");
} else {
  await esbuild.build(options);
  if (!reportSize()) process.exit(1);
}
