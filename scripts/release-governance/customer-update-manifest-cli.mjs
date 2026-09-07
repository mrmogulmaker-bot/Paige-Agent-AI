#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCustomerUpdateManifest } from "./customer-update-manifest.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const buildFlag = process.argv.indexOf("--build-id");
const buildId = buildFlag >= 0 ? process.argv[buildFlag + 1] : "";
const manifest = loadCustomerUpdateManifest({
  recordsDir: path.resolve(here, "../../docs/release-governance/records"),
  schemaPath: path.resolve(here, "../../docs/release-governance/release-record.schema.json"),
  buildId,
});
process.stdout.write(JSON.stringify(manifest));
