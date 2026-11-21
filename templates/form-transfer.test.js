const test = require('node:test');
const assert = require('node:assert/strict');
const { createGasEnv, runGas } = require('../harness/gas-mock');
const code = require('./load')('form-transfer.gs');

const header = ['日時', '氏名', 'メール', 'コース', '状態'];
const newEnv = () => createGasEnv({ sheets: {
  申込: [header,
    ['2026/11/01', '山田', 'a@x', 'A', ''],
    ['2026/11/02', '佐藤', 'b@x', 'B', '済'],
    ['', '', '', '', ''],
    ['2026/11/03', '鈴木', 'c@x', 'C', '']],
  名簿: [['氏名', 'コース']],
} });

test('未転記の行だけ氏名とコースを名簿に転記し、状態列に済を書く', () => {
  const env = newEnv();
  assert.equal(runGas(code, 'transferNewRows', env), 2);
  assert.deepEqual(env.sheets.名簿, [['氏名', 'コース'], ['山田', 'A'], ['鈴木', 'C']]);
  assert.deepEqual(env.sheets.申込.map((r) => r[4]), ['状態', '済', '済', '', '済']);
});

test('2回実行しても重複転記しない', () => {
  const env = newEnv();
  runGas(code, 'transferNewRows', env);
  assert.equal(runGas(code, 'transferNewRows', env), 0);
  assert.equal(env.sheets.名簿.length, 3);
});

test('見出しだけのシートでも落ちない', () => {
  const env = createGasEnv({ sheets: { 申込: [header], 名簿: [['氏名', 'コース']] } });
  assert.equal(runGas(code, 'transferNewRows', env), 0);
  assert.deepEqual(env.sheets.名簿, [['氏名', 'コース']]);
});
