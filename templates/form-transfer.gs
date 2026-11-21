// フォーム回答の自動転記
// 何をするか: 「申込」シートの未転記の行から、指定した列だけを「名簿」シートの末尾に追加し、
//             申込シートの状態列に「済」と書きます。2回実行しても同じ行は二重に転記されません。
// 書き換える場所: 下の CONFIG だけです（シート名・列番号）。列番号は A列=1, B列=2 … と数えます。
const CONFIG = {
  sourceSheet: '申込',   // 回答が入るシート（1行目は見出し）
  destSheet: '名簿',     // 転記先のシート
  doneColumn: 5,         // 「済」を書く列（E列）
  copyColumns: [2, 4],   // 転記する列（B列=氏名、D列=コース）
  doneMark: '済',
};

function transferNewRows() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const source = book.getSheetByName(CONFIG.sourceSheet);
  const dest = book.getSheetByName(CONFIG.destSheet);
  const lastRow = source.getLastRow();
  if (lastRow < 2) return 0;

  const width = Math.max(source.getLastColumn(), CONFIG.doneColumn);
  const rows = source.getRange(2, 1, lastRow - 1, width).getValues();
  const marks = rows.map((r) => [r[CONFIG.doneColumn - 1]]);
  const out = [];
  rows.forEach((row, i) => {
    if (row.every((c) => c === '')) return;                // 空行は飛ばす
    if (row[CONFIG.doneColumn - 1] !== '') return;         // 転記済みは飛ばす
    out.push(CONFIG.copyColumns.map((c) => row[c - 1]));
    marks[i][0] = CONFIG.doneMark;
  });
  if (out.length === 0) return 0;

  dest.getRange(dest.getLastRow() + 1, 1, out.length, out[0].length).setValues(out);
  source.getRange(2, CONFIG.doneColumn, rows.length, 1).setValues(marks);
  return out.length;
}
