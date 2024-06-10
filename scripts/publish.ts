import { execSync } from "node:child_process";
import * as fs from "node:fs";

const basePkg = fs.readFileSync("package.json").toString();
const pkg = JSON.parse(basePkg);

pkg.main = "esm/index.js";
pkg.types = "esm/index.d.ts";
pkg.files = ["esm", "bun.lockb"];

fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));

// 执行 npm publish
// 执行 npm publish --access public

execSync("npm publish --access public");
fs.writeFileSync("package.json", basePkg);
