// server.js (robust JSON recovery, ESM)
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";

const PORT = Number(process.env.PORT || 3000);
const GLOBAL_PUYA_CLI = process.env.PUYA_BIN || "puya-ts";
const DEFAULT_TIMEOUT_MS = Number(process.env.PUYA_TIMEOUT_MS || 20000);
const BODY_LIMIT = process.env.BODY_LIMIT || "2mb";

const app = express();

/**
 * Capture raw body while letting express.json() parse JSON.
 * express.json supports "verify" which receives the raw buffer.
 */
app.use(
  express.json({
    type: "application/json",
    limit: BODY_LIMIT,
    verify: (req, res, buf) => {
      req.rawBody = buf ? buf.toString("utf8") : "";
    },
  })
);

// Helpful small logger for debugging (remove or tone down in prod)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - content-type: ${req.headers["content-type"]}`);
  next();
});

function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const env = Object.assign({}, process.env, opts.env || {});
    const child = spawn(cmd, args, { ...opts, env, stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

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
  if (!fs.existsSync(dir)) return out;
  function walk(curr, base = "") {
    for (const ent of fs.readdirSync(curr, { withFileTypes: true })) {
      const full = path.join(curr, ent.name);
      const rel = base ? path.join(base, ent.name) : ent.name;
      if (ent.isDirectory()) walk(full, rel);
      else if (ent.isFile()) {
        try {
          out[rel] = { encoding: "utf8", data: fs.readFileSync(full, "utf8") };
        } catch (e) {
          out[rel] = { encoding: "base64", data: fs.readFileSync(full).toString("base64") };
        }
      }
    }
  }
  walk(dir);
  return out;
}

function tryRecoverCodeFromString(raw) {
  if (!raw || typeof raw !== "string") return null;

  // Trim leading junk until the first '{' to handle stray characters/prefixes
  const firstBrace = raw.indexOf("{");
  const trimmed = firstBrace >= 0 ? raw.slice(firstBrace) : raw;

  // 1) Try JSON.parse
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && typeof parsed.code === "string") return { filename: parsed.filename, code: parsed.code };
  } catch (e) {
    // fallthrough to tolerant extraction
  }

  // 2) Tolerant regex extraction of "code": "...."
  // This will capture between the first "code": " and the matching closing quote, including escaped quotes.
  const codeRegex = /"code"\s*:\s*"([\s\S]*?)"\s*(?:,|\})/m;
  const m = trimmed.match(codeRegex);
  if (m && m[1] !== undefined) {
    let captured = m[1];

    // Unescape JSON-style escapes via JSON.parse trick
    try {
      // Put captured in a JSON string wrapper and parse to unescape, but first escape existing double-quotes safely
      const safe = `"${captured.replace(/\\?"/g, '\\"').replace(/\n/g, "\\n")}"`;
      captured = JSON.parse(safe);
    } catch (ee) {
      // Fallback: common replacements
      captured = captured.replace(/\\r\\n/g, "\r\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"');
    }

    // extract filename if present
    const fnMatch = trimmed.match(/"filename"\s*:\s*"([^"]+)"/m);
    const filename = fnMatch ? fnMatch[1] : undefined;
    return { filename, code: captured };
  }

  // 3) If trimmed itself looks like the code (no JSON wrapper), return null here to let caller decide
  return null;
}

app.post("/compile", async (req, res) => {
  try {
    console.log("DEBUG: typeof req.body:", typeof req.body);
    if (typeof req.body === "object") {
      console.log("DEBUG: req.body keys:", Object.keys(req.body).slice(0, 20));
    } else if (req.rawBody) {
      console.log("DEBUG: req.rawBody (first 300):", req.rawBody.slice(0, 300));
    }

    // Enforce content-type
    const ct = (req.headers["content-type"] || "").toLowerCase();
    if (!ct.includes("application/json")) {
      // still try to recover from rawBody (special case) but inform the client
      console.warn("WARN: Content-Type is not application/json; attempting recovery from raw body");
    }

    let filename = "contract.algo.ts";
    let sourceCode = "";

    if (req.body && typeof req.body === "object" && typeof req.body.code === "string") {
      filename = req.body.filename || filename;
      sourceCode = req.body.code;
    } else if (req.rawBody && typeof req.rawBody === "string") {
      const recovered = tryRecoverCodeFromString(req.rawBody);
      if (recovered) {
        filename = recovered.filename || filename;
        sourceCode = recovered.code;
      } else {
        // Last resort: If the entire rawBody looks like code (no JSON), use it verbatim.
        // We check for quotes and braces — if these are present in high proportion, avoid using rawBody.
        const braceQuoteCount = (req.rawBody.match(/["{}]/g) || []).length;
        if (braceQuoteCount < 5) {
          sourceCode = req.rawBody;
        } else {
          // refuse: looks like JSON but couldn't extract code
          return res.status(400).json({ ok: false, error: "Unable to parse JSON body and extract 'code'. Ensure Content-Type: application/json and send { \"filename\", \"code\" }." });
        }
      }
    } else {
      return res.status(400).json({ ok: false, error: "Invalid request body. Expected JSON with { filename, code }." });
    }

    if (!sourceCode || typeof sourceCode !== "string" || !sourceCode.trim()) {
      return res.status(400).json({ ok: false, error: "Field 'code' must be a non-empty string" });
    }

    // Convert common double-escaped sequences if present
    if (sourceCode.includes("\\n") || sourceCode.includes("\\r\\n") || sourceCode.includes("\\t") || sourceCode.includes('\\"')) {
      sourceCode = sourceCode.replace(/\\r\\n/g, "\r\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"');
    }

    // Prevent path traversal
    const safeFilename = path.basename(filename) || "contract.algo.ts";
    const id = uuidv4();
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `puya-${id}-`));
    const srcPath = path.join(tmpRoot, safeFilename);
    const outDir = path.join(tmpRoot, "out");

    console.log("writing to:", srcPath);
    fs.writeFileSync(srcPath, sourceCode, "utf8");
    fs.mkdirSync(outDir, { recursive: true });

    const args = [srcPath, "--out-dir", outDir, "--skip-version-check"];
    console.log("running:", GLOBAL_PUYA_CLI, args.join(" "));
    const result = await runCommand(GLOBAL_PUYA_CLI, args, { env: process.env });

    const artifacts = readAllFilesRecursively(outDir);
    const meta = { stdout: result.stdout.slice(0, 20000), stderr: result.stderr.slice(0, 20000), producedFiles: Object.keys(artifacts) };

    if (Object.keys(artifacts).length === 0) {
      return res.status(500).json({ ok: false, error: "No artifacts produced", meta });
    }

    return res.json({ ok: true, artifacts, meta });
  } catch (err) {
    console.error("compile error:", err);
    return res.status(500).json({ ok: false, error: err.message || String(err), stderr: err.stderr });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Compiler server running on port ${PORT}`);
});
