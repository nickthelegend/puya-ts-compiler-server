// server.js (ESM)
import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";

const app = express();
// limit body size to something sane (adjust as needed)
app.use(bodyParser.text({ type: "*/*", limit: process.env.BODY_LIMIT || "200kb" }));

const USE_LOCAL_PUYA =
  String(process.env.USE_LOCAL_PUYA || "0").toLowerCase() === "1" ||
  String(process.env.USE_LOCAL_PUYA || "0").toLowerCase() === "true";

const DEFAULT_TIMEOUT_MS = Number(process.env.PUYA_TIMEOUT_MS || 20_000);

// If using local puya binary, default path is /opt/puya/puya (you can override PUYA_BIN)
const LOCAL_PUYA_BIN = process.env.PUYA_BIN || "/opt/puya/puya";
// When not using local binary, call the globally-installed puya-ts (or custom CLI if PUYA_BIN points to it)
const GLOBAL_PUYA_CLI = process.env.PUYA_BIN || "puya-ts";

function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    // merge env so PATH and other vars are preserved (allow callers to override via opts.env)
    const env = Object.assign({}, process.env, opts.env || {});
    const child = spawn(cmd, args, { ...opts, env, stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    const onDataOut = (d) => (stdout += d.toString());
    const onDataErr = (d) => (stderr += d.toString());

    child.stdout.on("data", onDataOut);
    child.stderr.on("data", onDataErr);

    const timeout = setTimeout(() => {
      child.removeAllListeners();
      child.kill("SIGKILL");
      reject(new Error(`Process timed out after ${DEFAULT_TIMEOUT_MS}ms\n${stderr}`));
    }, DEFAULT_TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        const err = new Error(`Process exited with code ${code}\n${stderr}`);
        err.code = code;
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

function readAllFilesRecursively(dir) {
  const out = {};
  function walk(current, relativeBase = "") {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(current, e.name);
      const rel = relativeBase ? path.join(relativeBase, e.name) : e.name;
      if (e.isDirectory()) {
        walk(full, rel);
      } else if (e.isFile()) {
        try {
          // try text first
          const text = fs.readFileSync(full, "utf8");
          out[rel] = { encoding: "utf8", data: text };
        } catch (err) {
          // binary -> base64
          const buf = fs.readFileSync(full);
          out[rel] = { encoding: "base64", data: buf.toString("base64") };
        }
      }
    }
  }
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

app.get("/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.post("/compile", async (req, res) => {
  const sourceCode = req.body ?? "";
  if (!sourceCode || sourceCode.trim().length === 0) {
    return res.status(400).json({ ok: false, error: "Empty source" });
  }

  const id = uuidv4();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `puya-${id}-`));
  const srcPath = path.join(tmpRoot, `${id}.algo.ts`);
  const outDir = path.join(tmpRoot, "out");

  try {
    fs.writeFileSync(srcPath, sourceCode, "utf8");
    fs.mkdirSync(outDir, { recursive: true });

    let cmd;
    let args;

    if (USE_LOCAL_PUYA) {
      // local binary (assumes it supports: build <file> -o <outdir>)
      cmd = LOCAL_PUYA_BIN;
      args = ["build", srcPath, "-o", outDir];
    } else {
      // use the globally installed @algorandfoundation/puya-ts CLI (or custom PUYA_BIN)
      cmd = GLOBAL_PUYA_CLI; // 'puya-ts' by default or overridden by PUYA_BIN env
      args = [srcPath, "--out-dir", outDir, "--skip-version-check"];
    }

    // run the compiler
    const result = await runCommand(cmd, args, { env: process.env });

    // read artifacts
    const artifacts = readAllFilesRecursively(outDir);

    // include CLI output/logs to help debugging
    const meta = {
      stdout: result.stdout ? String(result.stdout).slice(0, 10000) : "",
      stderr: result.stderr ? String(result.stderr).slice(0, 10000) : "",
      producedFiles: Object.keys(artifacts),
    };

    if (Object.keys(artifacts).length === 0) {
      return res.status(500).json({ ok: false, error: "No artifacts produced", meta });
    }

    res.json({ ok: true, artifacts, meta });
  } catch (err) {
    console.error("compile error:", err && (err.stack || err.message || err));
    const msg = (err && (err.message || String(err))) || "unknown error";
    return res.status(500).json({ ok: false, error: msg, stderr: err.stderr || undefined });
  } finally {
    // best-effort cleanup
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  }
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`🚀 Compiler server running on port ${PORT} (USE_LOCAL_PUYA=${USE_LOCAL_PUYA})`);
});
