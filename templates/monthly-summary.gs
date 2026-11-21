// 月次・区分別の自動集計
// 何をするか: 「経費」シートを年月と区分ごとに合計し、「月次集計」シートを毎回作り直します。
//             日付は日付形式でも「2026/11/05」のような文字列でも読めます。金額が数値にならない行は飛ばします。
// 書き換える場所: 下の CONFIG だけです（シート名・列番号）。
const CONFIG = {
  dataSheet: '経費',           // 元データのシート（1行目は見出し）
  dateColumn: 1,               // 日付の列（A列）
  categoryColumn: 2,           // 区分の列（B列）
  amountColumn: 3,             // 金額の列（C列）
  summarySheet: '月次集計',    // 集計の出力先（無ければ自動で作ります）
};

function toYearMonth_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v.getFullYear === 'function') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy/MM');
  }
  const m = String(v).match(/^(\d{4})[\/-](\d{1,2})/);
  return m ? m[1] + '/' + ('0' + m[2]).slice(-2) : null;
}

function toNumber_(v) {
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[,\s]/g, '');
  return s === '' ? NaN : Number(s);
}

function buildMonthlySummary() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const data = book.getSheetByName(CONFIG.dataSheet);
  const lastRow = data.getLastRow();
  const width = Math.max(data.getLastColumn(), CONFIG.dateColumn, CONFIG.categoryColumn, CONFIG.amountColumn);
  const rows = lastRow < 2 ? [] : data.getRange(2, 1, lastRow - 1, width).getValues();

  const totals = {};
  rows.forEach((row) => {
    const ym = toYearMonth_(row[CONFIG.dateColumn - 1]);
    const category = row[CONFIG.categoryColumn - 1];
    const amount = toNumber_(row[CONFIG.amountColumn - 1]);
    if (ym === null || category === '' || isNaN(amount)) return;
    const key = ym + '\t' + category;
    totals[key] = (totals[key] || 0) + amount;
  });

  const body = Object.keys(totals).sort().map((key) => {
    const parts = key.split('\t');
    return [parts[0], parts[1], totals[key]];
  });
  const out = [['年月', '区分', '合計']].concat(body);

  const summary = book.getSheetByName(CONFIG.summarySheet) || book.insertSheet(CONFIG.summarySheet);
  summary.clear();
  summary.getRange(1, 1, out.length, 3).setValues(out);
  return body.length;
}
