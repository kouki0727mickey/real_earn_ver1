const test = require('node:test');
const assert = require('node:assert/strict');
const { createGasEnv, runGas } = require('../harness/gas-mock');
const code = require('./load')('condition-mail.gs');

const header = ['品名', '担当', '数量', 'メモ', '通知'];
const newEnv = () => createGasEnv({ sheets: { 在庫: [header,
  ['A', 'x', 150, '', ''],
  ['B', 'x', '1,200', '', ''],
  ['C', 'x', 50, '', ''],
  ['D', 'x', 'abc', '', ''],
  ['E', 'x', 200, '', '通知済'],
  ['F', 'x', '¥150円', '', ''],
  ['', '', '', '', '']] } });

test('しきい値以上で未通知の行ごとに1通送り、通知済を書く（文字列の1,200も数値扱い）', () => {
  const env = newEnv();
  assert.equal(runGas(code, 'notifyMatchingRows', env), 3);
  assert.equal(env.sentMails.length, 3);
  assert.ok(env.sentMails.every((m) => m.to === 'owner@example.com'));
  assert.match(env.sentMails[0].body, /A/);
  assert.match(env.sentMails[0].body, /150/);
  assert.match(env.sentMails[1].body, /B/);
  assert.deepEqual(env.sheets.在庫.map((r) => r[4]), ['通知', '通知済', '通知済', '', '', '通知済', '通知済', '']);
});

test('2回実行してもメールを重複送信しない', () => {
  const env = newEnv();
  runGas(code, 'notifyMatchingRows', env);
  assert.equal(runGas(code, 'notifyMatchingRows', env), 0);
  assert.equal(env.sentMails.length, 3);
});

test('見出しだけのシートでも落ちない', () => {
  const env = createGasEnv({ sheets: { 在庫: [header] } });
  assert.equal(runGas(code, 'notifyMatchingRows', env), 0);
  assert.equal(env.sentMails.length, 0);
});

test('M9: 数値にできない行はログに件数を残す', () => {
  const env = newEnv();
  runGas(code, 'notifyMatchingRows', env);
  assert.ok(env.logs.some((l) => /スキップ.*1/.test(l)), env.logs.join('|'));
});
