import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const INSTALLER = path.join(REPO_ROOT, 'installer', 'install.js');

test('re-running the installer updates an existing Claude plugin', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'caveman-claude-update-'));
  const bin = path.join(root, 'bin');
  const configDir = path.join(root, 'claude');
  const log = path.join(root, 'claude-args.log');
  fs.mkdirSync(bin);

  const fake = path.join(root, 'fake-claude.mjs');
  fs.writeFileSync(fake, [
    "import fs from 'node:fs';",
    "const args = process.argv.slice(2);",
    "fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, args.join(' ') + '\\n');",
    "if (args.join(' ') === 'plugin list') process.stdout.write('caveman@caveman\\n');",
  ].join('\n') + '\n');
  if (process.platform === 'win32') {
    fs.writeFileSync(path.join(bin, 'claude.cmd'), `@echo off\r\n"${process.execPath}" "${fake}" %*\r\n`);
  } else {
    const launcher = path.join(bin, 'claude');
    fs.writeFileSync(launcher, `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`);
    fs.chmodSync(launcher, 0o755);
  }

  const sep = process.platform === 'win32' ? ';' : ':';
  try {
    const result = spawnSync(process.execPath, [INSTALLER, '--only', 'claude', '--no-hooks',
      '--no-mcp-shrink', '--non-interactive', '--config-dir', configDir], {
      env: {
        ...process.env,
        HOME: root,
        USERPROFILE: root,
        CLAUDE_CONFIG_DIR: configDir,
        FAKE_CLAUDE_LOG: log,
        PATH: `${bin}${sep}${process.env.PATH || ''}`,
        NO_COLOR: '1',
      },
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const calls = fs.readFileSync(log, 'utf8').trim().split('\n');
    assert.deepEqual(calls, ['plugin list', 'plugin update caveman@caveman']);
    assert.match(result.stdout, /claude plugin update caveman@caveman/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
