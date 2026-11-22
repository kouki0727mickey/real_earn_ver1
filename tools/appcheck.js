'use strict';
// 依頼者のアプリを、インストール → ビルド → 起動 → 画面巡回まで自動で確かめる検査ツール。
// 使い方: node tools/appcheck.js <アプリのフォルダ> [--routes /,/login] [--port 3900] [--out 出力先] [--no-install]
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'out', '.vercel', 'coverage']);
const CODE_EXT = /\.(jsx?|tsx?|mjs|cjs|vue|svelte|astro)$/;
const PUBLIC_PREFIX = /^(NEXT_PUBLIC_|VITE_|PUBLIC_|NUXT_PUBLIC_|REACT_APP_|EXPO_PUBLIC_)/;
const SECRET_WORD = /(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|WEBHOOK_SECRET)/;
// 直書きされやすい鍵の形（Stripe 秘密鍵、Supabase service_role の JWT、OpenAI/Anthropic、AWS）
const SECRET_VALUE = /(sk_(live|test)_[A-Za-z0-9]{16,}|rk_live_[A-Za-z0-9]{16,}|sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16}|whsec_[A-Za-z0-9]{16,})/;

function detectPm(dir) {
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(dir, 'bun.lockb')) || fs.existsSync(path.join(dir, 'bun.lock'))) return 'bun';
  return 'npm';
}

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), base, out);
    } else if (CODE_EXT.test(e.name)) {
      out.push(path.relative(base, path.join(dir, e.name)).split(path.sep).join('/'));
    }
  }
  return out;
}

function scanEnv(dir) {
  const names = new Set();
  const re = /(?:process\.env|import\.meta\.env)(?:\.([A-Z][A-Z0-9_]*)|\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\])/g;
  for (const f of walk(dir)) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of text.matchAll(re)) names.add(m[1] || m[2]);
  }
  ['NODE_ENV', 'PORT', 'MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'CI']
    .forEach((n) => names.delete(n));
  const sorted = [...names].sort();
  const examplePath = ['.env.example', '.env.sample', '.env.local.example'].map((n) => path.join(dir, n)).find(fs.existsSync);
  const inExample = new Set();
  if (examplePath) {
    for (const line of fs.readFileSync(examplePath, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/);
      if (m) inExample.add(m[1]);
    }
  }
  return {
    names: sorted,
    hasExample: Boolean(examplePath),
    missingFromExample: sorted.filter((n) => !inExample.has(n)),
    exposedSecrets: sorted.filter((n) => PUBLIC_PREFIX.test(n) && SECRET_WORD.test(n)),
  };
}

function scanSecrets(dir) {
  const hits = [];
  for (const f of walk(dir)) {
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((line, i) => {
      const m = line.match(SECRET_VALUE);
      if (m) hits.push({ file: f, line: i + 1, kind: m[0].slice(0, 8) + '…（値は伏せています）' });
    });
  }
  return hits;
}

function deployGuide(env) {
  const lines = ['## 公開（デプロイ）前に設定する環境変数', ''];
  if (env.names.length === 0) lines.push('環境変数は使われていません。');
  for (const n of env.names) {
    const scope = PUBLIC_PREFIX.test(n) ? 'ブラウザに公開される値' : 'サーバー専用（公開してはいけない値）';
    lines.push(`- \`${n}\`: ${scope}`);
  }
  if (env.exposedSecrets.length) {
    lines.push('', '### 危険: 秘密の値がブラウザに公開される名前になっています');
    env.exposedSecrets.forEach((n) => lines.push(`- \`${n}\`: 公開用の接頭辞を外し、サーバー側だけで読むように直す必要があります。`));
  }
  if (env.missingFromExample.length) {
    lines.push('', `### ${env.hasExample ? '.env.example に載っていない変数' : '.env.example がありません。次の変数が必要です'}`);
    env.missingFromExample.forEach((n) => lines.push(`- \`${n}\``));
  }
  lines.push('', '値そのものは、この資料にも納品物にも書きません。公開先（Vercel など）の「Environment Variables」に、ご自身で入力してください。');
  return lines.join('\n');
}

function waitForHttp(port, timeoutMs, child) {
  const started = Date.now();
  return new Promise((resolve) => {
    let exited = null;
    child.once('exit', (code) => { exited = code; });
    const tick = () => {
      if (exited !== null) return resolve({ up: false, reason: `起動コマンドが終了しました（終了コード ${exited}）` });
      if (Date.now() - started > timeoutMs) return resolve({ up: false, reason: `${Math.round(timeoutMs / 1000)}秒待っても応答がありません` });
      const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1000 }, (res) => { res.resume(); resolve({ up: true }); });
      req.on('error', () => setTimeout(tick, 300));
      req.on('timeout', () => { req.destroy(); });
    };
    tick();
  });
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* 既に終了 */ } }
}

async function runCheck({ dir, routes = ['/'], port = 3900, out, install = true, startTimeoutMs = 90000 }) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const scripts = pkg.scripts || {};
  const pm = detectPm(dir);
  fs.mkdirSync(out, { recursive: true });
  const result = { ok: false, pm, install: 'skipped', build: 'skipped', pages: [], problems: [] };
  const env = { ...process.env, PORT: String(port), CI: '1', NEXT_TELEMETRY_DISABLED: '1' };
  const tail = (s) => String(s || '').trim().split('\n').slice(-15).join('\n');

  if (install) {
    const r = spawnSync(pm, ['install'], { cwd: dir, env, encoding: 'utf8', timeout: 600000 });
    result.install = r.status === 0 ? 'passed' : 'failed';
    if (r.status !== 0) result.problems.push({ kind: 'install', detail: tail(r.stderr || r.stdout) });
  }
  if (scripts.build && result.install !== 'failed') {
    const r = spawnSync(pm, ['run', 'build'], { cwd: dir, env, encoding: 'utf8', timeout: 900000 });
    result.build = r.status === 0 ? 'passed' : 'failed';
    if (r.status !== 0) result.problems.push({ kind: 'build', detail: tail((r.stdout || '') + '\n' + (r.stderr || '')) });
  }

  const startScript = scripts.start ? 'start' : (scripts.dev ? 'dev' : null);
  if (!startScript) result.problems.push({ kind: 'start', detail: 'package.json に start も dev もありません' });

  if (startScript && result.install !== 'failed' && result.build !== 'failed') {
    const child = spawn(pm, ['run', startScript], { cwd: dir, env, detached: true, stdio: 'ignore' });
    try {
      const up = await waitForHttp(port, startTimeoutMs, child);
      if (!up.up) {
        result.problems.push({ kind: 'start', detail: up.reason });
      } else {
        const { chromium } = require('playwright');
        const browser = await chromium.launch();
        try {
          for (const route of routes) {
            const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
            const found = [];
            page.on('pageerror', (e) => found.push({ route, kind: 'pageerror', detail: String(e.message).slice(0, 300) }));
            page.on('console', (m) => { if (m.type() === 'error') found.push({ route, kind: 'console', detail: m.text().slice(0, 300) }); });
            page.on('requestfailed', (r) => found.push({ route, kind: 'requestfailed', detail: r.url().slice(0, 200) }));
            let status = null;
            try {
              const res = await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'load', timeout: 30000 });
              status = res ? res.status() : null;
              await page.waitForTimeout(500);
            } catch (e) {
              found.push({ route, kind: 'navigation', detail: String(e.message).slice(0, 300) });
            }
            if (status !== null && status >= 400) found.push({ route, kind: 'http', status, detail: `HTTP ${status}` });
            // HTTP エラー時にブラウザが出す「リソース読み込み失敗」のコンソール行は http と重複するので除く
            const problems = found.filter((p) => !(p.kind === 'console' && status >= 400 && /Failed to load resource/.test(p.detail)));
            const shot = path.join(out, `page-${result.pages.length + 1}.png`);
            await page.screenshot({ path: shot, fullPage: true }).catch(() => {});
            result.pages.push({ route, status, screenshot: shot, problems: problems.length });
            result.problems.push(...problems);
            await page.close();
          }
        } finally {
          await browser.close();
        }
      }
    } finally {
      killTree(child);
    }
  }

  result.ok = result.problems.length === 0 && result.pages.length === routes.length;
  result.env = scanEnv(dir);
  result.hardcodedSecrets = scanSecrets(dir);
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(out, 'report.md'), renderReport(result));
  return result;
}

function renderReport(r) {
  const L = [`# 動作検査の結果: ${r.ok ? '合格' : '不合格'}`, '',
    `- パッケージ管理: ${r.pm}`, `- インストール: ${r.install}`, `- ビルド: ${r.build}`, '', '## 画面ごとの結果', ''];
  if (r.pages.length === 0) L.push('画面の確認まで進めませんでした。');
  r.pages.forEach((p) => L.push(`- \`${p.route}\`: HTTP ${p.status ?? '応答なし'}、問題 ${p.problems} 件、画像 ${path.basename(p.screenshot)}`));
  L.push('', '## 見つかった問題', '');
  if (r.problems.length === 0) L.push('なし');
  r.problems.forEach((p) => L.push(`- [${p.kind}]${p.route ? ' `' + p.route + '`' : ''} ${String(p.detail).split('\n').join(' / ')}`));
  if (r.hardcodedSecrets.length) {
    L.push('', '## 危険: コードに直書きされた鍵', '');
    r.hardcodedSecrets.forEach((s) => L.push(`- ${s.file}:${s.line} ${s.kind}`));
  }
  L.push('', deployGuide(r.env), '',
    '## この検査で確かめていないこと', '',
    '- ログイン後の画面、決済、メール送信など、鍵や外部サービスが必要な動作',
    '- スマホ表示、表示速度、データの正しさ',
    '上の項目は、出品者本人が手元で確認します。');
  return L.join('\n') + '\n';
}

module.exports = { detectPm, scanEnv, scanSecrets, deployGuide, runCheck, renderReport };

if (require.main === module) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
  if (!dir) { console.error('使い方: node tools/appcheck.js <アプリのフォルダ> [--routes /,/login] [--port 3900] [--out 出力先] [--no-install]'); process.exit(2); }
  runCheck({
    dir: path.resolve(dir),
    routes: opt('--routes', '/').split(','),
    port: Number(opt('--port', '3900')),
    out: path.resolve(opt('--out', path.join(dir, '.appcheck'))),
    install: !args.includes('--no-install'),
  }).then((r) => { console.log(renderReport(r)); process.exit(r.ok ? 0 : 1); })
    .catch((e) => { console.error(e); process.exit(2); });
}
