const test = require('node:test');
const assert = require('node:assert/strict');
const { createGasEnv, runGas } = require('../harness/gas-mock');
const code = require('./load')('monthly-summary.gs');

const header = ['日付', '区分', '金額'];
const data = [header,
  ['2026/11/05', '交通費', 300],
  [new Date('2026-11-20T00:00:00+09:00'), '交通費', 500],
  ['2026/11/10', '飲食', '1,200'],
  ['2026/12/01', '交通費', 100],
  ['', '', ''],
  ['2026/12/02', '飲食', 'abc']];
const expected = [['年月', '区分', '合計'],
  ['2026/11', '交通費', 800],
  ['2026/11', '飲食', 1200],
  ['2026/12', '交通費', 100]];

test('年月×区分で合計し、年月昇順・区分昇順で集計シートに書く（Date型・文字列金額も扱う）', () => {
  const env = createGasEnv({ sheets: { 経費: data } });
  assert.equal(runGas(code, 'buildMonthlySummary', env), 3);
  assert.deepEqual(env.sheets.月次集計, expected);
});

test('2回実行しても、既存の古い集計を作り直すだけで重複しない', () => {
  const env = createGasEnv({ sheets: { 経費: data, 月次集計: [['年月', '区分', '合計'], ['2020/01', '古い', 1]] } });
  runGas(code, 'buildMonthlySummary', env);
  runGas(code, 'buildMonthlySummary', env);
  assert.deepEqual(env.sheets.月次集計, expected);
});

test('見出しだけのシートでは見出しのみの集計シートになる', () => {
  const env = createGasEnv({ sheets: { 経費: [header] } });
  assert.equal(runGas(code, 'buildMonthlySummary', env), 0);
  assert.deepEqual(env.sheets.月次集計, [['年月', '区分', '合計']]);
});
