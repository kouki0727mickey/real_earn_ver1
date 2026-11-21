const test = require('node:test');
const assert = require('node:assert/strict');
const { createGasEnv, runGas } = require('./gas-mock');

test('getValues / appendRow / getLastRow は1始まりで動く', () => {
  const env = createGasEnv({ sheets: { 入力: [['名前', '金額'], ['A', 100]] } });
  const last = runGas(`function f(){ const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('入力');
    s.appendRow(['B', s.getRange(2, 2).getValue() * 2]); return s.getLastRow(); }`, 'f', env);
  assert.equal(last, 3);
  assert.deepEqual(env.sheets['入力'][2], ['B', 200]);
});

test('setValues は範囲外を空文字で広げる', () => {
  const env = createGasEnv({ sheets: { S: [['x']] } });
  runGas(`function f(){ SpreadsheetApp.getActiveSpreadsheet().getSheetByName('S').getRange(3, 2, 1, 2).setValues([[1, 2]]); }`, 'f', env);
  assert.deepEqual(env.sheets.S, [['x', '', ''], ['', '', ''], ['', 1, 2]]);
});

test('setValues は行列数が合わないと例外', () => {
  const env = createGasEnv({ sheets: { S: [['x']] } });
  assert.throws(() => runGas(`function f(){ SpreadsheetApp.getActiveSpreadsheet().getSheetByName('S').getRange(1, 1, 2, 2).setValues([[1, 2]]); }`, 'f', env), /setValues/);
});

test('空シートの getLastRow は 0、存在しないシートは null', () => {
  const env = createGasEnv({ sheets: { 空: [] } });
  const r = runGas(`function f(){ const b = SpreadsheetApp.getActiveSpreadsheet();
    return [b.getSheetByName('空').getLastRow(), b.getSheetByName('無い')]; }`, 'f', env);
  assert.equal(r[0], 0);
  assert.equal(r[1], null);
});

test('メール送信は記録される', () => {
  const env = createGasEnv({ sheets: {} });
  runGas(`function f(){ MailApp.sendEmail('a@example.com', '件名', '本文'); }`, 'f', env);
  assert.deepEqual(env.sentMails, [{ to: 'a@example.com', subject: '件名', body: '本文' }]);
});

test('formatDate と固定時刻', () => {
  const env = createGasEnv({ sheets: {}, now: new Date('2026-12-01T00:30:00Z') });
  assert.equal(runGas(`function f(){ return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'); }`, 'f', env), '2026/12/01 09:30');
});

test('未対応 API は名前つきで失敗する', () => {
  const env = createGasEnv({ sheets: {} });
  assert.throws(() => runGas(`function f(){ return UrlFetchApp.fetch('https://example.com'); }`, 'f', env), /gas-mock: 未対応API UrlFetchApp/);
});

test('insertSheet と clear（月次集計の作り直し用）', () => {
  const env = createGasEnv({ sheets: { 集計: [['古い']] } });
  runGas(`function f(){ const b = SpreadsheetApp.getActiveSpreadsheet();
    b.getSheetByName('集計').clear();
    const n = b.insertSheet('新規'); n.appendRow(['a']); }`, 'f', env);
  assert.deepEqual(env.sheets['集計'], []);
  assert.deepEqual(env.sheets['新規'], [['a']]);
});

test('引数付きで関数を呼べる', () => {
  const env = createGasEnv({ sheets: {} });
  assert.equal(runGas(`function add(a, b){ return a + b; }`, 'add', env, 2, 3), 5);
});

test('I2: 行数0や0始まり、A1表記の getRange は本物のGASと同様に例外', () => {
  const env = createGasEnv({ sheets: { S: [['見出し']] } });
  const call = (expr) => () => runGas(`function f(){ return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('S').${expr}; }`, 'f', env);
  assert.throws(call('getRange(2, 1, 0, 1).getValues()'), /gas-mock: getRange/);
  assert.throws(call('getRange(0, 1)'), /gas-mock: getRange/);
  assert.throws(call("getRange('A1')"), /gas-mock: getRange.*A1/);
});

test('I2: sendEmail はオブジェクト形式でも記録される', () => {
  const env = createGasEnv({ sheets: {} });
  runGas(`function f(){ MailApp.sendEmail({ to: 'a@example.com', subject: '件名', body: '本文' }); }`, 'f', env);
  assert.deepEqual(env.sentMails, [{ to: 'a@example.com', subject: '件名', body: '本文' }]);
});

test('I3: シートの日付セルは sandbox 内で instanceof Date になり、書き戻しても元の型に戻る', () => {
  const d = new Date('2026-11-20T00:00:00+09:00');
  const env = createGasEnv({ sheets: { S: [[d]] } });
  const r = runGas(`function f(){ const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('S');
    const v = s.getRange(1, 1).getValue(); s.getRange(2, 1).setValue(new Date(v.getTime())); return v instanceof Date; }`, 'f', env);
  assert.equal(r, true);
  assert.deepEqual(env.sheets.S[1][0], d);
});

test('I5: setNumberFormat は記録され、書式を@にした列には文字列がそのまま残る', () => {
  const env = createGasEnv({ sheets: { S: [] } });
  runGas(`function f(){ const r = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('S').getRange(1, 1, 1, 1);
    r.setNumberFormat('@'); r.setValues([['2026/11']]); }`, 'f', env);
  assert.deepEqual(env.numberFormats, [{ sheet: 'S', row: 1, col: 1, nr: 1, nc: 1, format: '@' }]);
  assert.equal(env.sheets.S[0][0], '2026/11');
});
