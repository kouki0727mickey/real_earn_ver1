const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { detectPm, scanEnv, scanSecrets, deployGuide, runCheck } = require('./appcheck');

const FX = path.join(__dirname, 'fixtures');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'appcheck-'));

test('detectPm はロックファイルで判定し、無ければ npm', () => {
  const d = tmp();
  assert.equal(detectPm(d), 'npm');
  fs.writeFileSync(path.join(d, 'pnpm-lock.yaml'), '');
  assert.equal(detectPm(d), 'pnpm');
  const y = tmp(); fs.writeFileSync(path.join(y, 'yarn.lock'), '');
  assert.equal(detectPm(y), 'yarn');
});

test('scanEnv は使用中の環境変数を拾い、node_modules は無視する', () => {
  const r = scanEnv(path.join(FX, 'app-broken'));
  assert.deepEqual(r.names, ['NEXT_PUBLIC_STRIPE_SECRET_KEY', 'NEXT_PUBLIC_SUPABASE_URL',
    'STRIPE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_API_BASE']);
});

test('scanEnv は .env.example に無い変数と、公開してはいけない秘密鍵を報告する', () => {
  const r = scanEnv(path.join(FX, 'app-broken'));
  assert.deepEqual(r.missingFromExample, ['NEXT_PUBLIC_STRIPE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_API_BASE']);
  assert.deepEqual(r.exposedSecrets, ['NEXT_PUBLIC_STRIPE_SECRET_KEY']);
});

test('scanSecrets はコードに直書きされた鍵を、値を伏せて報告する', () => {
  // ダミー鍵はリポジトリに置かず、ここで組み立てる（GitHub の秘密検知に誤検知させないため）
  const d = tmp();
  fs.mkdirSync(path.join(d, 'src'));
  const fake = ['sk', 'live', 'FAKEFAKEFAKEFAKEFAKE1234'].join('_');
  fs.writeFileSync(path.join(d, 'src', 'pay.ts'), `const a = 1;\nconst key = "${fake}";\n`);
  const r = scanSecrets(d);
  assert.equal(r.length, 1);
  assert.equal(r[0].file, 'src/pay.ts');
  assert.equal(r[0].line, 2);
  assert.ok(!JSON.stringify(r).includes('FAKEFAKE'), '鍵の値を出力に含めない');
  assert.deepEqual(scanSecrets(path.join(FX, 'app-broken')), []);
});

test('deployGuide は変数名の一覧と公開範囲を含み、値の例は含まない', () => {
  const g = deployGuide(scanEnv(path.join(FX, 'app-broken')));
  assert.match(g, /STRIPE_SECRET_KEY/);
  assert.match(g, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(g, /危険/);
});

test('runCheck: 正常なアプリは ok で、ビルド実行とスクリーンショットが残る', async () => {
  const out = tmp();
  const r = await runCheck({ dir: path.join(FX, 'app-ok'), routes: ['/', '/about'], port: 3911, out, install: false });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.equal(r.build, 'passed');
  assert.ok(fs.existsSync(path.join(FX, 'app-ok', 'built.txt')));
  assert.equal(r.pages.length, 2);
  assert.ok(fs.statSync(r.pages[0].screenshot).size > 1000);
  assert.ok(fs.readFileSync(path.join(out, 'report.md'), 'utf8').includes('合格'));
});

test('runCheck: 画面のJSエラーと 500 応答を問題として報告する', async () => {
  const out = tmp();
  const r = await runCheck({ dir: path.join(FX, 'app-broken'), routes: ['/', '/api'], port: 3912, out, install: false });
  assert.equal(r.ok, false);
  assert.equal(r.build, 'skipped');
  assert.ok(r.problems.some((p) => p.route === '/' && p.kind === 'pageerror'));
  assert.ok(r.problems.some((p) => p.route === '/api' && p.kind === 'http' && p.status === 500));
  assert.ok(fs.readFileSync(path.join(out, 'report.md'), 'utf8').includes('不合格'));
});

test('runCheck: 起動しないアプリは、理由つきで不合格にして固まらない', async () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ scripts: { start: 'node -e "process.exit(3)"' } }));
  const r = await runCheck({ dir: d, routes: ['/'], port: 3913, out: tmp(), install: false, startTimeoutMs: 4000 });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.kind === 'start'));
});
