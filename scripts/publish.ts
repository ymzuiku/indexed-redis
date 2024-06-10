import { execSync } from "node:child_process";
import * as fs from "node:fs";

const basePkg = fs.readFileSync("package.json").toString();
const pkg = JSON.parse(basePkg);

pkg.main = "esm/index.js";
pkg.types = "esm/index.d.ts";
pkg.files = ["esm", "bun.lockb"];

fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2));

execSync("npm rum esm");

// 执行一些命令
execSync("npm publish --access public", { stdio: "inherit" });
fs.writeFileSync("package.json", basePkg);
