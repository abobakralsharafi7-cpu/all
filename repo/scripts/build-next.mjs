import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const env = { ...process.env };
const wasmDir = resolve("node_modules", "@next", "swc-wasm-nodejs");

if (process.platform === "win32" && existsSync(resolve(wasmDir, "wasm.js"))) {
  env.NEXT_TEST_WASM_DIR = wasmDir;
}

const nextBin = resolve("node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "build", "--webpack"], {
  env,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
