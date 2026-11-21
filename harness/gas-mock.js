'use strict';
// GAS コードを Node 上で実行するための最小モック。未対応 API は黙って通さず例外にする。
const vm = require('node:vm');

const UNSUPPORTED = ['DriveApp', 'UrlFetchApp', 'DocumentApp', 'CalendarApp',
  'PropertiesService', 'ScriptApp', 'HtmlService', 'LockService'];

function isEmpty(v) { return v === '' || v === null || v === undefined; }

function lastRowOf(data) {
  for (let i = data.length - 1; i >= 0; i--) if (data[i].some((c) => !isEmpty(c))) return i + 1;
  return 0;
}

function lastColOf(data) {
  let max = 0;
  data.forEach((row) => row.forEach((c, j) => { if (!isEmpty(c) && j + 1 > max) max = j + 1; }));
  return max;
}

function pad(data) {
  const width = data.reduce((m, r) => Math.max(m, r.length), 0);
  data.forEach((r) => { while (r.length < width) r.push(''); });
}

function makeRange(env, name, row, col, nr, nc) {
  const data = () => env.sheets[name];
  return {
    getValues() {
      const d = data();
      const out = [];
      for (let i = 0; i < nr; i++) {
        const r = [];
        for (let j = 0; j < nc; j++) {
          const v = (d[row - 1 + i] || [])[col - 1 + j];
          r.push(v === undefined ? '' : v);
        }
        out.push(r);
      }
      return out;
    },
    getValue() { return this.getValues()[0][0]; },
    setValues(vals) {
      if (vals.length !== nr || vals.some((r) => r.length !== nc)) {
        throw new Error(`gas-mock: setValues のサイズが範囲(${nr}x${nc})と一致しません`);
      }
      const d = data();
      while (d.length < row - 1 + nr) d.push([]);
      for (let i = 0; i < nr; i++) {
        const r = d[row - 1 + i];
        while (r.length < col - 1 + nc) r.push('');
        for (let j = 0; j < nc; j++) r[col - 1 + j] = vals[i][j];
      }
      pad(d);
    },
    setValue(v) { this.setValues([[v]]); },
    clearContent() {
      const d = data();
      for (let i = 0; i < nr; i++) {
        const r = d[row - 1 + i];
        if (r) for (let j = 0; j < nc; j++) if (col - 1 + j < r.length) r[col - 1 + j] = '';
      }
    },
  };
}

function makeSheet(env, name) {
  const data = () => env.sheets[name];
  const sheet = {
    getName() { return name; },
    getLastRow() { return lastRowOf(data()); },
    getLastColumn() { return lastColOf(data()); },
    getRange(row, col, nr = 1, nc = 1) { return makeRange(env, name, row, col, nr, nc); },
    getDataRange() {
      return makeRange(env, name, 1, 1, Math.max(1, lastRowOf(data())), Math.max(1, lastColOf(data())));
    },
    appendRow(arr) {
      const d = data();
      const at = lastRowOf(d);
      d.length = at; // 末尾の空行を捨てて直後に追加
      d.push(Array.from(arr)); // vm 内の配列を本体側の配列に変換する
      pad(d);
    },
    clear() { env.sheets[name] = []; },
    clearContents() { env.sheets[name] = []; },
  };
  return sheet;
}

function pad2(n) { return String(n).padStart(2, '0'); }

function formatDate(date, tz, fmt) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).reduce((a, p) => { a[p.type] = p.value; return a; }, {});
  return fmt.replace(/yyyy|MM|dd|HH|mm|ss/g, (t) => ({
    yyyy: parts.year, MM: parts.month, dd: parts.day, HH: parts.hour, mm: parts.minute, ss: parts.second,
  })[t]);
}

function createGasEnv({ sheets = {}, now } = {}) {
  return { sheets, now, sentMails: [], logs: [] };
}

function buildContext(env) {
  const book = {
    getSheetByName(n) { return Object.prototype.hasOwnProperty.call(env.sheets, n) ? makeSheet(env, n) : null; },
    getActiveSheet() { return makeSheet(env, Object.keys(env.sheets)[0]); },
    getSheets() { return Object.keys(env.sheets).map((n) => makeSheet(env, n)); },
    insertSheet(n) {
      if (Object.prototype.hasOwnProperty.call(env.sheets, n)) throw new Error(`gas-mock: シート名 ${n} は既に存在します`);
      env.sheets[n] = [];
      return makeSheet(env, n);
    },
  };
  const sendEmail = (to, subject, body) => { env.sentMails.push({ to, subject, body }); };
  const log = (...a) => { env.logs.push(a.join(' ')); };
  const sandbox = {
    SpreadsheetApp: { getActiveSpreadsheet: () => book, getActive: () => book },
    MailApp: { sendEmail },
    GmailApp: { sendEmail },
    Utilities: { formatDate },
    Session: { getScriptTimeZone: () => 'Asia/Tokyo' },
    Logger: { log },
    console: { log },
  };
  for (const name of UNSUPPORTED) {
    sandbox[name] = new Proxy({}, {
      get() { throw new Error(`gas-mock: 未対応API ${name}`); },
      apply() { throw new Error(`gas-mock: 未対応API ${name}`); },
    });
  }
  if (env.now) {
    const fixed = env.now.getTime();
    sandbox.Date = class extends Date {
      constructor(...a) { if (a.length === 0) super(fixed); else super(...a); }
      static now() { return fixed; }
    };
  }
  return vm.createContext(sandbox);
}

function runGas(code, fnName, env, ...args) {
  const ctx = buildContext(env);
  vm.runInContext(code, ctx);
  const fn = vm.runInContext(fnName, ctx);
  return fn(...args);
}

module.exports = { createGasEnv, runGas };
