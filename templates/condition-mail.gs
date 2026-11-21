// 条件に合う行のメール通知
// 何をするか: 「在庫」シートで、数量（C列）がしきい値以上で、まだ通知していない行ごとに
//             メールを1通送り、通知列に「通知済」と書きます。2回実行しても同じ行には再送しません。
// 書き換える場所: 下の CONFIG だけです。mailTo を通知を受け取るアドレスに変えてください。
const CONFIG = {
  sheet: '在庫',                 // 対象シート（1行目は見出し）
  checkColumn: 3,                // 判定する列（C列）
  threshold: 100,                // この値以上で通知
  notifiedColumn: 5,             // 「通知済」を書く列（E列）
  notifiedMark: '通知済',
  mailTo: 'owner@example.com',   // 通知先アドレス
  subject: '[自動通知] 条件に達した行があります',
};

function toNumber_(v) {
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[,\s¥￥円]/g, '');
  return s === '' ? NaN : Number(s);
}

function notifyMatchingRows() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const width = Math.max(sheet.getLastColumn(), CONFIG.notifiedColumn);
  const rows = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  const marks = rows.map((r) => [r[CONFIG.notifiedColumn - 1]]);
  let count = 0;
  let skipped = 0;
  try {
    rows.forEach((row, i) => {
      if (row[CONFIG.notifiedColumn - 1] !== '') return;   // 通知済みは飛ばす
      const v = toNumber_(row[CONFIG.checkColumn - 1]);
      if (isNaN(v)) {                                       // 数値として読めない行は飛ばす
        if (row[CONFIG.checkColumn - 1] !== '') skipped++;
        return;
      }
      if (v < CONFIG.threshold) return;
      MailApp.sendEmail(CONFIG.mailTo, CONFIG.subject, row.join(' / '));
      marks[i][0] = CONFIG.notifiedMark;
      count++;
    });
  } finally {
    // 途中でメール送信が失敗しても、送れた分は通知済にして再送を防ぐ
    sheet.getRange(2, CONFIG.notifiedColumn, rows.length, 1).setValues(marks);
  }
  if (skipped > 0) Logger.log('スキップした行: ' + skipped + '行（判定列が数値として読めませんでした）');
  return count;
}
