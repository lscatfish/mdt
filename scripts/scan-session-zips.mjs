#!/usr/bin/env node
/**
 * Pre-commit credential scan for dsh-session-*.zip archives.
 *
 * A session zip contains the full session.jsonl in plain text: user input,
 * model reasoning and every tool call. If a future session ever reads an
 * .env, pastes an API key or stores a private key, that zip would carry the
 * credential into the public repo. This script refuses commits that stage
 * such an archive containing a likely credential.
 *
 * Usage: node scripts/scan-session-zips.mjs
 * Exit 0 = clean (or nothing staged); exit 1 = credential-like hit found.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GIT_OPTS = { cwd: process.cwd() };

const ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  ...GIT_OPTS,
  encoding: 'utf8',
}).trim();

const CREDENTIAL_PATTERNS = [
  // OpenAI-style keys
  /\bsk-[A-Za-z0-9]{16,}\b/,
  // DeepSeek-style env key with value
  /DEEPSEEK_API_KEY\s*=\s*\S+/,
  // Bearer tokens
  /Authorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
  // Private keys
  /BEGIN (RSA|OPENSSH|EC|DSA|PGP) PRIVATE KEY/,
  // GitHub PAT / OAuth tokens
  /\bghp_[A-Za-z0-9]{36}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  // api keys with a real-looking value (16+ chars, not a placeholder)
  /\bapi[_-]?key\s*[:=]\s*["']?[A-Za-z0-9+/=_-]{16,}/i,
  // passwords with a real-looking value (excludes common placeholders)
  // note: bare "pass" is NOT scanned — renderer "pass" terms caused false hits
  /\b(password|passwd)\s*[:=]\s*["']?(?!password\b|changeme\b|yourpassword\b|12345678\b|123456\b|root\b|admin\b)[^\s"']{8,}/i,
  // explicit secret assignments (16+ chars)
  /\bsecret\s*[:=]\s*["']?[A-Za-z0-9+/=_-]{16,}/i,
];

/** Extract a zip into a fresh temp dir; returns the dir (caller cleans up). */
function extract(zipPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-zipscan-'));
  try {
    // Windows 10+ ships bsdtar which reads zip; fall back to PowerShell.
    execFileSync('tar', ['-xf', zipPath, '-C', tmp], { stdio: 'pipe' });
  } catch {
    execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${tmp}' -Force`],
      { stdio: 'pipe' },
    );
  }
  return tmp;
}

/** Scan one zip; returns array of `file -> pattern` hit descriptions. */
function scanZip(zipPath) {
  const hits = [];
  const tmp = extract(zipPath);
  try {
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.jsonl$/i.test(entry.name)) continue;
        const text = fs.readFileSync(full, 'utf8');
        for (const re of CREDENTIAL_PATTERNS) {
          if (re.test(text)) hits.push(`${entry.name} -> ${re}`);
        }
      }
    };
    walk(tmp);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return hits;
}

// Staged files only: a zip that is already committed but unmodified is not
// this hook's business (rewriting history is a separate, deliberate step).
// Explicit CLI args override staged detection (manual full scans).
const args = process.argv.slice(2);
const staged = args.length > 0
  ? args
  : execFileSync('git', ['diff', '--cached', '--name-only', '-z'], {
      ...GIT_OPTS,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean);

const zips = staged.filter((f) => /dsh-session-.*\.zip$/i.test(f));
if (zips.length === 0) process.exit(0);

let failed = false;
for (const rel of zips) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue; // deleted in working tree; nothing to scan
  const hits = scanZip(abs);
  if (hits.length > 0) {
    failed = true;
    console.error(`[scan-session-zips] credential-like content in ${rel}:`);
    for (const h of hits) console.error(`  - ${h}`);
  } else {
    console.log(`[scan-session-zips] clean: ${rel}`);
  }
}

if (failed) {
  console.error(
    '[scan-session-zips] commit blocked: staged session zip looks like it contains credentials.',
  );
  console.error(
    '[scan-session-zips] if this is a false positive, double-check the file, then commit with --no-verify.',
  );
  process.exit(1);
}
