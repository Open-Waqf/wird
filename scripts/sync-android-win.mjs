#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const cwd = process.cwd();
const openAfterSync = process.argv.includes('--open');

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
  if (res.status !== 0) {
    const err = (res.stderr || '').trim() || `${cmd} ${args.join(' ')} failed`;
    throw new Error(err);
  }
  return (res.stdout || '').trim();
}

function tryRun(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
  if (res.status !== 0) return null;
  return (res.stdout || '').trim();
}

function hasCmd(cmd) {
  const res = spawnSync('bash', ['-lc', `command -v ${cmd} >/dev/null 2>&1`], {encoding: 'utf8'});
  return res.status === 0;
}

function toWslPath(winPath) {
  if (winPath.startsWith('/')) return winPath;
  return run('wslpath', ['-u', winPath]);
}

function toWinPath(wslPath) {
  if (/^[A-Za-z]:\\/.test(wslPath)) return wslPath;
  return run('wslpath', ['-w', wslPath]);
}

function resolveWindowsTempWslPath() {
  let winTemp = process.env.OWQ_WIN_TEMP || '';
  if (!winTemp) {
    winTemp = tryRun('powershell.exe', ['-NoProfile', '-Command', '$env:TEMP']) || '';
  }
  if (!winTemp) {
    winTemp = tryRun('cmd.exe', ['/C', 'echo', '%TEMP%']) || '';
  }

  if (winTemp) {
    return toWslPath(winTemp);
  }

  const usersRoot = '/mnt/c/Users';
  if (fs.existsSync(usersRoot)) {
    const preferred = [];
    const fallback = [];
    for (const d of fs.readdirSync(usersRoot, {withFileTypes: true}).filter((x) => x.isDirectory())) {
      const name = d.name;
      const tempPath = path.join(usersRoot, name, 'AppData/Local/Temp');
      if (!fs.existsSync(tempPath)) continue;
      try {
        fs.accessSync(tempPath, fs.constants.W_OK);
      } catch {
        continue;
      }
      if (/^(default|default user|public|all users)$/i.test(name)) {
        fallback.push(tempPath);
      } else {
        preferred.push(tempPath);
      }
    }
    const candidates = [...preferred, ...fallback];
    if (candidates.length > 0) return candidates[0];
  }

  throw new Error('Unable to resolve Windows temp directory. Set OWQ_WIN_TEMP, e.g. OWQ_WIN_TEMP="C:\\Users\\<you>\\AppData\\Local\\Temp"');
}

function copyDir(srcAbs, dstAbs) {
  fs.mkdirSync(path.dirname(dstAbs), {recursive: true});

  if (hasCmd('rsync')) {
    fs.mkdirSync(dstAbs, {recursive: true});
    run('rsync', ['-a', '--delete', `${srcAbs}/`, `${dstAbs}/`], {stdio: ['ignore', 'inherit', 'inherit']});
    return;
  }

  fs.rmSync(dstAbs, {recursive: true, force: true});
  fs.mkdirSync(dstAbs, {recursive: true});
  run('cp', ['-a', `${srcAbs}/.`, dstAbs], {stdio: ['ignore', 'inherit', 'inherit']});
}

function main() {
  const projectName = 'wird';
  const stageName = process.env.OWQ_WIN_STAGE_NAME || `owq-${projectName}-android`;

  const wslTemp = resolveWindowsTempWslPath();

  const stageRootWsl = path.join(wslTemp, stageName);
  const stageRootWin = toWinPath(stageRootWsl);

  const sources = [
    'android',
    'node_modules/@capacitor/android',
    'node_modules/@capacitor/app',
    'node_modules/@capacitor/filesystem',
    'node_modules/@capacitor/haptics',
    'node_modules/@capacitor/share',
    'node_modules/@capacitor/status-bar',
    'node_modules/@capacitor-mlkit/barcode-scanning',
  ];

  for (const rel of sources) {
    const src = path.join(cwd, rel);
    if (!fs.existsSync(src)) {
      console.warn(`[skip] missing ${rel}`);
      continue;
    }
    const dst = path.join(stageRootWsl, rel);
    process.stdout.write(`[sync] ${rel}\n`);
    copyDir(src, dst);
  }

  const androidWin = toWinPath(path.join(stageRootWsl, 'android'));
  process.stdout.write(`\nStaged Android project: ${androidWin}\n`);
  process.stdout.write(`Staged root: ${stageRootWin}\n`);
  process.stdout.write('Open this folder in Android Studio (Windows mode).\n');

  if (openAfterSync) {
    const opened = tryRun('powershell.exe', ['-NoProfile', '-Command', `Start-Process explorer.exe '${androidWin.replace(/'/g, "''")}'`], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    if (opened !== null) {
      process.stdout.write('Opened staged android folder in Windows Explorer.\n');
    } else {
      process.stdout.write('Could not auto-open Windows Explorer in this environment. Open the staged Android path manually.\n');
    }
  }
}

main();
