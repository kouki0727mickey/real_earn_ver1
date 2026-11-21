# ココナラ GAS自動化代行 × Claude 半自動納品パイプライン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ココナラで「GAS/スプレッドシート自動化代行」を出品し、制作・返信文・提案文・週次改善を Claude のスケジュールタスクで自動化して、手取り平均 1,000円/日（30,000円/30日）に到達する。

**Architecture:** 人間は「依頼文を自分宛てメールに貼る」「下書きをココナラに貼る」「実シートで1回動かす」だけを行う。Claude のスケジュールタスクが Gmail の自分宛てメール（件名 `[依頼]` `[提案]` `[売上]`）を拾い、リポジトリ内のプレイブックに従って GAS コードを書き、Node 上の GAS モックでテストし、納品物一式を Gmail 下書きに置く。状態は Gmail ラベルだけで持ち、リポジトリは読み取り専用の道具箱として使う。

**Tech Stack:** Python 3（標準ライブラリ + pytest）、Node.js 標準の `node:test` / `node:vm`、Playwright（サムネイル生成、導入済み）、Claude Code スケジュールタスク + Gmail コネクタ。

**Spec:** 独立した spec は無い。下の「0. 設計判断」が spec を兼ねる。

## 0. 設計判断（なぜこの方法か）

確率はすべて筆者の主観見積もりで、統計ではない。「90日以内に手取り月3万円に届く確率」で比較した。

| 方法 | 見積もり確率 | 完全放置できるか | 落とした理由 |
|---|---|---|---|
| **ココナラで GAS/スプレッドシート自動化代行（採用）** | 30〜40% | 不可（1日10〜20分） | — |
| ココナラ/クラウドワークスで記事執筆代行 | 15〜25% | 不可 | 単価が下がり続けており、AI 利用禁止の案件も多い |
| note・Booth・Gumroad でデジタル商品販売 | 5〜10% | ほぼ可 | 大半の出品者が売上ゼロ。集客手段が無いと売れない |
| AI 記事ブログ + アフィリエイト/広告 | 5% 未満 | 可 | 検索流入が立つまで半年以上、AI 量産記事は評価されにくい |
| 株・FX・暗号資産の自動売買 | 期待値マイナス | 可 | 元本を失う。「稼ぐ確率」ではなく「賭け」 |
| SNS/YouTube 自動投稿 | 5% 未満 | 可 | 収益化条件（登録者数等）に届くまでが長い |

採用理由は3つ。(1) 買い手が既にお金を払う気で検索しに来る場所で売るので集客が要らない。(2) 納品物がコードなので、動く/動かないをテストで確かめられ、Claude の出力品質がそのまま商品価値になる。(3) 必要件数が少ない（下記）。

**正直な前提:** 「初期設定だけして後は完全放置で毎日1,000円」を高確率で満たす方法は見つからなかった。採用案は、ココナラ上の操作（メッセージ送信・納品）を人間が行う必要があり、毎日10〜20分の作業が残る。ココナラの画面を Claude に自動操作させることは、アカウント停止リスクがあるためこの計画では行わない。また30〜40%という数字のとおり、届かない可能性のほうが高い。撤退基準を Task 7 に置く。

**必要件数:** 手数料22%（税込）。手取り = 販売額 − floor(販売額 × 0.22)。5,000円 → 手取り3,900円、3,000円 → 2,340円。月30,000円には 5,000円 × 8件（手取り31,200円）、つまり週2件。

## Global Constraints

- 目標値: 直近30日の手取り合計 ÷ 30 ≥ 1,000円。
- 手数料率は `0.22` を定数 `FEE_RATE` として1か所に置く（ビデオチャットは対象外なので扱わない）。
- Python は標準ライブラリのみ。テストは `pytest`。Node は外部パッケージ無し、`node --test`。
- スケジュールタスクはリポジトリへ書き込まない。顧客の文面・氏名・メールアドレスをコミットしない。
- ココナラのサイトへ自動アクセス（スクレイピング・自動投稿）しない。送信と納品は必ず人間が行う。
- 返信文・納品物に外部連絡先（メール、LINE、Google Drive 共有リンク等）を書かない。ココナラは外部誘導を禁止している。納品はトークルームへのファイル添付かテキスト貼り付けで行う。
- 出品文とプロフィールに「AI を活用して制作し、動作確認は出品者本人が行う」と明記する。
- 生成する文章はすべて日本語、です・ます調。

## Review Focus

1. 依頼文が曖昧（シート構成や列名が不明）→ コードを書かず、確認質問だけの返信下書きを作る。（Task 4）
2. 依頼が範囲外・規約違反（他サイトのスクレイピング、外部でのやり取り希望、ログイン情報の預かり）→ 丁寧に断る下書きを作る。（Task 4）
3. 同じメールが2回処理される → ラベル `RE1/処理済` が付いたスレッドは検索条件で除外する。（Task 4、Task 6）
4. 依頼コードがモック未対応の API を使う（DriveApp、UrlFetchApp 等）→ モックは黙って通さず例外を投げ、下書きの冒頭に「未テスト箇所」を明記する。（Task 2、Task 4）
5. `[売上]` メールの件名が崩れている（全角数字、カンマ、「円」付き、金額なし）→ 全角・カンマ・円は受け付け、金額なしは集計から外して警告に出す。（Task 1）

## File Structure

```
real_earn_ver1/
├── CLAUDE.md                     # このリポジトリで動く Claude への常時ルール（Global Constraints の写し）
├── earn/ledger.py                # 売上の純粋計算（手取り、30日平均、目標との差）
├── tests/test_ledger.py
├── harness/gas-mock.js           # GAS コードを Node で実行するためのモック環境
├── harness/gas-mock.test.js
├── templates/                    # よくある依頼3種の GAS 雛形とそのテスト
│   ├── form-transfer.gs / .test.js
│   ├── condition-mail.gs / .test.js
│   └── monthly-summary.gs / .test.js
├── playbooks/
│   ├── fulfil.md                 # [依頼] メール → 納品物下書き
│   ├── propose.md                # [提案] メール → 提案文下書き
│   └── weekly-review.md          # [売上] 集計 → 週次レポート下書き
├── fixtures/                     # プレイブックの試運転用の依頼文サンプル
│   ├── request-clear.md / request-vague.md / request-out-of-scope.md
├── listing/
│   ├── service.md                # 出品文（Task 0 の文面の正本）
│   ├── thumbnail.html / make-thumbnail.js / thumbnail.png
└── docs/superpowers/plans/       # この計画
```

---

### Task 0（人間）: ココナラのアカウントと出品を作る

所要 60〜90 分。Task 5 でサムネイル画像ができてから Step 6 以降を行う。Step 1〜5 は今日できる。

- [ ] **Step 1: 会員登録** — https://coconala.com を開き「会員登録」を押す。メールアドレスは **Claude に接続している Gmail アドレス**を使う（通知メールを Claude が読めるようにするため）。
- [ ] **Step 2: 本人確認と電話番号認証** — 右上のアイコン →「設定」→「本人確認」で運転免許証かマイナンバーカードを撮影して提出。同じ設定画面の「電話番号認証」も済ませる。審査は数日かかることがある。
- [ ] **Step 3: 振込口座登録** —「設定」→「売上管理」→「振込口座」で自分名義の口座を登録する。
- [ ] **Step 4: ルールを読む** — https://coconala.com/pages/guide_rule を開き、AI 生成物・AI 利用に関する項目を探して読む。出品画面に「AI 利用」の申告欄があれば必ず「利用する」を選ぶ。**AI を使った制作代行が禁止と書かれていた場合は、ここで止めて Claude に知らせる**（計画を作り直す）。
- [ ] **Step 5: プロフィール** — 「プロフィール編集」の自己紹介に次を貼る。

```
エンジニアの Koki です。Google スプレッドシートと GAS（Google Apps Script）による業務自動化を専門にしています。

・転記、集計、メール通知など「毎日の手作業」をボタン1つ、または完全自動にします
・設置手順書つきで、プログラミング未経験の方でもそのまま使える状態でお渡しします
・制作には AI を活用し、納品前の動作確認は私自身が必ず行います

ご相談は無料です。「こんなことできる？」だけでもお気軽にどうぞ。平日・土日とも当日中にお返事します。
```

- [ ] **Step 6: 出品** —「出品する」→ カテゴリは「IT・プログラミング・開発」→「作業自動化・効率化」（名称が違えば GAS・マクロに最も近いもの）。以下を入力する。文字数超過と表示されたら末尾から削る。
  - タイトル: `GASでスプレッドシート作業を自動化します`
  - キャッチコピー: `転記・集計・メール通知を自動に。手順書つきで未経験でも安心`
  - 価格: `3000` 円（評価5件までの導入価格。Task 7 で 5,000円に上げる）
  - お届け日数: `3` 日
  - サービス内容・購入にあたってのお願い・有料オプション: `listing/service.md` の各節をそのまま貼る
  - 画像: `listing/thumbnail.png`
- [ ] **Step 7: 通知設定** —「設定」→「通知設定」で、メッセージ・見積り相談・購入のメール通知をすべて ON にする。スマホにココナラアプリを入れてプッシュ通知も ON にする。
- [ ] **Step 8: Claude に報告** — 出品が公開されたら Claude に「出品完了」と伝える（Task 6 のスケジュールタスク作成に進むため）。

---

### Task 1: 売上計算 `earn/ledger.py`

**Files:**
- Create: `earn/__init__.py`, `earn/ledger.py`, `tests/test_ledger.py`, `CLAUDE.md`, `.gitignore`

**Interfaces:**
- Produces:
  - `FEE_RATE = 0.22`、`DAILY_TARGET = 1000`
  - `net(gross: int) -> int`
  - `parse_sale(subject: str) -> int | None` — 件名 `[売上] 5000` から販売額を取り出す
  - `summary(sales: list[tuple[date, int]], today: date, window_days: int = 30) -> dict` — キーは `orders`, `gross`, `net`, `daily_avg_net`, `gap_per_day`, `orders_needed_at_5000`
  - CLI: `python -m earn.ledger --today YYYY-MM-DD`。標準入力は1行 `YYYY-MM-DD<TAB>件名`。標準出力に summary の JSON、解釈できなかった行は標準エラーに `WARN: <行>`。

- [ ] **Step 1: 失敗するテストを書く**

```python
from datetime import date
from earn.ledger import net, parse_sale, summary

def test_net_deducts_22_percent_floor():
    assert net(5000) == 3900
    assert net(3000) == 2340
    assert net(3333) == 2600   # 手数料 floor(733.26) = 733

def test_parse_sale_variants():
    assert parse_sale("[売上] 5000") == 5000
    assert parse_sale("[売上] 5,000円") == 5000
    assert parse_sale("[売上]　５０００") == 5000
    assert parse_sale("Re: [売上] 3000") == 3000
    assert parse_sale("[売上]") is None
    assert parse_sale("[依頼] 5000") is None

def test_summary_uses_only_window():
    sales = [(date(2026, 12, 20), 5000), (date(2026, 12, 1), 5000), (date(2026, 11, 1), 5000)]
    s = summary(sales, today=date(2026, 12, 21))
    assert s["orders"] == 2 and s["gross"] == 10000 and s["net"] == 7800
    assert s["daily_avg_net"] == 260.0
    assert s["gap_per_day"] == 740.0
    assert s["orders_needed_at_5000"] == 6   # ceil((30000 - 7800) / 3900)

def test_summary_empty():
    s = summary([], today=date(2026, 12, 21))
    assert s["orders"] == 0 and s["daily_avg_net"] == 0.0 and s["orders_needed_at_5000"] == 8
```

CLI テストも1本加える: `subprocess.run` で2行（正常1行、`2026-12-20\t[売上]` の1行）を流し、標準出力の JSON の `orders == 1`、標準エラーに `WARN` を含むことを確認。

- [ ] **Step 2: 失敗を確認** — `pytest tests/test_ledger.py -v` → `ModuleNotFoundError: earn`
- [ ] **Step 3: 実装** — 窓は `today - window_days < 日付 <= today`。全角数字は `unicodedata.normalize("NFKC", ...)` で半角にする。`gap_per_day` と `orders_needed_at_5000` は 0 未満にしない。
- [ ] **Step 4: 合格を確認** — `pytest tests/test_ledger.py -v` → 5 passed
- [ ] **Step 5: `CLAUDE.md` を書く** — Global Constraints の8項目をそのまま箇条書きにする。`.gitignore` に `__pycache__/`, `.pytest_cache/`, `orders/`, `node_modules/`。
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: add sales ledger calculations"`

---

### Task 2: GAS モック `harness/gas-mock.js`

**Files:**
- Create: `harness/gas-mock.js`, `harness/gas-mock.test.js`, `package.json`（`{"private": true, "scripts": {"test": "node --test"}}`）

**Interfaces:**
- Produces:
  - `createGasEnv({ sheets: { [name]: any[][] }, now?: Date }) -> env`。`env.sheets[name]` は現在の2次元配列、`env.sentMails` は `{to, subject, body}[]`、`env.logs` は `string[]`。
  - `runGas(code: string, fnName: string, env, ...args) -> any` — `node:vm` で `code` を評価し `fnName` を呼ぶ。
  - 対応 API: `SpreadsheetApp.getActiveSpreadsheet()` / `.getSheetByName(n)`（無ければ `null`）/ `.getActiveSheet()`（最初のシート）、シートの `getLastRow` `getLastColumn` `getDataRange` `getRange(row, col, numRows=1, numCols=1)` `appendRow` `getName`、レンジの `getValues` `setValues` `getValue` `setValue` `clearContent`、`MailApp.sendEmail(to, subject, body)` と `GmailApp.sendEmail`（同じ記録先）、`Utilities.formatDate(date, tz, fmt)`（`yyyy` `MM` `dd` `HH` `mm` `ss` のみ）、`Session.getScriptTimeZone()` → `"Asia/Tokyo"`、`Logger.log` と `console.log`、`new Date()` は `now` 指定時その時刻。
  - 未対応のグローバル（`DriveApp`, `UrlFetchApp`, `DocumentApp`, `CalendarApp`, `PropertiesService`, `ScriptApp`, `HtmlService`, `LockService`）は、プロパティに触れた時点で `Error("gas-mock: 未対応API <名前>")` を投げる。

- [ ] **Step 1: 失敗するテストを書く**（`harness/gas-mock.test.js`）

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGasEnv, runGas } = require('./gas-mock');

test('getValues / appendRow / getLastRow は1始まりで動く', () => {
  const env = createGasEnv({ sheets: { 入力: [['名前', '金額'], ['A', 100]] } });
  runGas(`function f(){ const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('入力');
    s.appendRow(['B', s.getRange(2, 2).getValue() * 2]); return s.getLastRow(); }`, 'f', env);
  assert.deepEqual(env.sheets['入力'][2], ['B', 200]);
});

test('setValues は範囲外を空文字で広げる', () => {
  const env = createGasEnv({ sheets: { S: [['x']] } });
  runGas(`function f(){ SpreadsheetApp.getActiveSpreadsheet().getSheetByName('S').getRange(3, 2, 1, 2).setValues([[1, 2]]); }`, 'f', env);
  assert.deepEqual(env.sheets.S, [['x', '', ''], ['', '', ''], ['', 1, 2]]);
});

test('空シートの getLastRow は 0、存在しないシートは null', () => {
  const env = createGasEnv({ sheets: { 空: [] } });
  assert.equal(runGas(`function f(){ const b = SpreadsheetApp.getActiveSpreadsheet();
    return [b.getSheetByName('空').getLastRow(), b.getSheetByName('無い')]; }`, 'f', env)[0], 0);
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
```

- [ ] **Step 2: 失敗を確認** — `node --test harness/` → `Cannot find module './gas-mock'`
- [ ] **Step 3: 実装** — 未対応 API は `Proxy` の `get` トラップで投げる。`setValues` は行数・列数が引数と合わなければ GAS と同様に例外を投げる。
- [ ] **Step 4: 合格を確認** — `node --test harness/` → pass 6, fail 0
- [ ] **Step 5: Commit** — `git commit -am "feat: add GAS mock harness"`（新規ファイルは `git add harness package.json` を先に）

---

### Task 3: 頻出依頼の雛形3種 `templates/`

**Files:**
- Create: `templates/form-transfer.gs`, `templates/condition-mail.gs`, `templates/monthly-summary.gs` と各 `.test.js`

**Interfaces:**
- Consumes: `createGasEnv`, `runGas`（Task 2）。テストは `fs.readFileSync` で `.gs` を読み `runGas` に渡す。
- Produces: 各 `.gs` は先頭に `const CONFIG = {...}` を持ち、顧客ごとの差分は CONFIG だけで済む形にする。
  - `form-transfer.gs`: `transferNewRows()` — `CONFIG.sourceSheet` の未転記行を `CONFIG.destSheet` に追記し、`CONFIG.doneColumn` に `済` を書く。戻り値は転記件数。
  - `condition-mail.gs`: `notifyMatchingRows()` — `CONFIG.checkColumn` の値が `CONFIG.threshold` 以上で `CONFIG.notifiedColumn` が空の行について `CONFIG.mailTo` に1通送り、`通知済` を書く。戻り値は送信件数。
  - `monthly-summary.gs`: `buildMonthlySummary()` — `CONFIG.dateColumn` の年月と `CONFIG.categoryColumn` ごとに `CONFIG.amountColumn` を合計し、`CONFIG.summarySheet` を `['年月', '区分', '合計']` 見出しで作り直す。年月昇順、区分昇順。

- [ ] **Step 1: 失敗するテストを書く** — 各雛形につき次の3観点を必ず入れる。
  - 正常系: 具体値で結果の配列を `deepEqual`（例: monthly-summary は `2026/11` の「交通費」2行 300+500 → `['2026/11', '交通費', 800]`）。
  - 2回実行しても重複しない（form-transfer と condition-mail は2回目の戻り値が `0`、メールは増えない）。
  - 見出しだけのシート・空行・金額が文字列 `"1,200"` の行で落ちない（文字列金額は 1200 として扱い、数値にできない行は飛ばす）。
- [ ] **Step 2: 失敗を確認** — `node --test templates/` → 3ファイルとも ENOENT
- [ ] **Step 3: 実装** — セル読み書きは `getValues`/`setValues` の一括で行い、ループ内で `getRange` を呼ばない（実環境の6分制限対策）。各関数の先頭に日本語コメントで「何をするか・どこを書き換えるか」を書く（そのまま納品物になるため）。
- [ ] **Step 4: 合格を確認** — `node --test` → fail 0
- [ ] **Step 5: Commit** — `git add templates && git commit -m "feat: add three GAS delivery templates"`

---

### Task 4: プレイブックと試運転 `playbooks/` `fixtures/`

**Files:**
- Create: `playbooks/fulfil.md`, `playbooks/propose.md`, `playbooks/weekly-review.md`, `fixtures/request-clear.md`, `fixtures/request-vague.md`, `fixtures/request-out-of-scope.md`, `tests/test_playbooks.py`

**Interfaces:**
- Consumes: `templates/*.gs`、`harness/gas-mock.js`、`python -m earn.ledger`。
- Produces: スケジュールタスク（Task 6）が読む3つの手順書。Gmail ラベル名 `RE1/処理済`、下書き件名の接頭辞 `[納品案]` `[確認質問]` `[お断り案]` `[提案案]` `[週次]`。

- [ ] **Step 1: 構造テストを書く**（`tests/test_playbooks.py`）— 3ファイルが存在し、`fulfil.md` に文字列 `RE1/処理済`、`未テスト箇所`、`[確認質問]`、`[お断り案]`、`node --test` を含み、3ファイルすべてに `外部連絡先` と `コミットしない` を含むこと。
- [ ] **Step 2: 失敗を確認** — `pytest tests/test_playbooks.py -v` → FAIL
- [ ] **Step 3: `playbooks/fulfil.md` を書く** — 次の手順をこの順で、命令形の番号つきで書く。
  1. Gmail を `from:me to:me subject:[依頼] -label:RE1/処理済 newer_than:3d` で検索。0件なら何もせず終了。
  2. スレッドごとに本文（顧客の依頼文）を読み、3分類する。**明確** = シート名・列・やりたい処理・実行のきっかけ（ボタン/時刻/フォーム送信）が全部わかる。**曖昧** = どれか欠ける。**範囲外** = 他サイトのスクレイピング、ログイン情報の預かり、ココナラ外でのやり取り希望、違法・迷惑行為、または GAS で実現できないもの。
  3. 明確: 最も近い `templates/*.gs` を土台に `orders/<スレッドID>/main.gs` と `main.test.js` を作る（`orders/` は .gitignore 済み、コミットしない）。テストは依頼文の具体例を値に使い、正常系・2回実行・空データの3観点を入れる。`node --test orders/<スレッドID>/` が通るまで直す。モック未対応 API が必要なら、その呼び出しを1関数に隔離して残りをテストし、下書き冒頭の「未テスト箇所」に関数名と人間が確かめる手順を書く。
  4. 明確の下書き `[納品案] <依頼の要約15字以内>` を自分宛てに作る。本文の節はこの順: `■ 未テスト箇所`（無ければ「なし」）/ `■ 人間が行う動作確認`（新規スプレッドシートに貼るテストデータ表と、実行する関数名、期待結果）/ `■ お客様への返信文`（そのまま貼れる文）/ `■ 納品コード`（全文）/ `■ 設置手順`（拡張機能 → Apps Script を開く、貼る、保存、関数を選んで実行、権限を許可、トリガー設定まで番号つき）。
  5. 曖昧: `[確認質問] <要約>` を作る。本文は、そのまま貼れる返信文1通。質問は最大4つ、番号つき、はい/いいえか一語で答えられる形。コードは書かない。
  6. 範囲外: `[お断り案] <要約>` を作る。本文は理由を一文で述べて丁寧に断る返信文。GAS で可能な代替があれば1つ提案する。
  7. 返信文の共通ルール: 外部連絡先・URL・共有リンクを書かない。納期は約束しない（人間が決める）。顧客名は「お客様」とする。
  8. 処理したスレッドにラベル `RE1/処理済` を付ける（ラベルが無ければ作る）。下書き作成に失敗したスレッドには付けない。
  9. 顧客の文面をリポジトリにコミットしない。リポジトリへは push しない。
- [ ] **Step 4: `playbooks/propose.md` を書く** — 検索条件は `subject:[提案]`。公開依頼の文面に対し、`[提案案] <要約>` の下書きを作る。本文: 依頼内容の言い換え1文、実現方法3行、提案価格（初回は 3,000円、作業が雛形1つで収まらなければ 5,000〜10,000円の範囲で理由つき）、納期の目安、確認したい点最大2つ。400字以内。範囲外の基準と共通ルール、ラベル付けは fulfil と同じ。
- [ ] **Step 5: `playbooks/weekly-review.md` を書く** — `from:me to:me subject:[売上] newer_than:31d` を検索し、各スレッドの日付と件名を `YYYY-MM-DD<TAB>件名` にして `python -m earn.ledger --today <今日>` に流す。`[週次] <日付> 日平均<daily_avg_net>円` の下書きを作る。本文: summary の全項目、WARN 行、過去7日の `[依頼]` `[提案]` 件数、Task 7 の価格ラダーと撤退基準に照らした「今週やること」を最大3つ。売上メールはラベルを付けない（毎週数え直すため）。
- [ ] **Step 6: fixtures を書く** — `request-clear.md`: 「『申込』シートのA〜D列（日時・氏名・メール・コース）に Google フォームの回答が入る。新しい回答が来たら『名簿』シートに氏名とコースだけ転記し、E列に済と入れたい。毎朝9時に自動で」。`request-vague.md`: 「スプレッドシートの管理が大変なので自動化してほしいです。いくらでできますか？」。`request-out-of-scope.md`: 「競合の EC サイトの価格を毎日スクレイピングしてシートに入れたい。詳細は LINE で話したいので ID を教えてください」。
- [ ] **Step 7: 試運転** — Gmail を使わず、`fulfil.md` の手順 2〜7 を fixtures 3件に対して手で実行し、結果を `orders/dryrun-{clear,vague,oos}/draft.md` に書く。確認: clear は `node --test orders/dryrun-clear/` が fail 0 で、draft に5節すべてがある。vague は質問4つ以下でコード無し。oos は「LINE」「ID」の受け渡しに応じておらず、スクレイピングを断っている。3件とも draft に `http`、`@`、`LINE ID` の提示が無い（`grep -nE "https?://|@" orders/dryrun-*/draft.md` が0件）。
- [ ] **Step 8: 合格を確認して Commit** — `pytest -v && node --test` → 全合格。`git add playbooks fixtures tests && git commit -m "feat: add fulfilment, proposal and weekly review playbooks"`

---

### Task 5: 出品文とサムネイル `listing/`

**Files:**
- Create: `listing/service.md`, `listing/thumbnail.html`, `listing/make-thumbnail.js`, `listing/thumbnail.png`, `tests/test_listing.py`

**Interfaces:**
- Produces: Task 0 Step 6 で人間が貼る文面と画像。

- [ ] **Step 1: テストを書く** — `service.md` に見出し `## サービス内容` `## 購入にあたってのお願い` `## 有料オプション` があり、本文に `AI` と `動作確認` を含み、`http` と `@` を含まないこと。`thumbnail.png` の PNG ヘッダから読んだ寸法が 1220×1240 で、サイズが 2MB 未満であること（`struct.unpack(">II", data[16:24])`）。
- [ ] **Step 2: 失敗を確認** — `pytest tests/test_listing.py -v` → FAIL
- [ ] **Step 3: `listing/service.md` を書く** — 次の内容を各節に入れる。
  - サービス内容: 冒頭に「毎日の転記・集計・メール送信、まだ手作業ですか？」。できることの例5つ（フォーム回答の自動転記／条件に合う行のメール通知／月次・区分別の自動集計／シート間のデータ同期／定時の自動実行）。基本料金に含む範囲（処理1つ、シート2枚まで、設置手順書、納品後7日間の不具合修正）。流れ4段階（相談 → 内容確認 → 制作・動作確認 → 納品）。「制作には AI を活用し、納品前の動作確認は出品者本人が行います」。対応しないこと（他サイトからの自動取得、ログイン情報のお預かり、ココナラ外でのやり取り）。
  - 購入にあたってのお願い: 購入前に見積り相談を送ってほしいこと。伝えてほしい4点（シート名と列の並び／やりたい処理／実行のきっかけ／サンプルデータ2〜3行。個人情報はダミーに置き換え）。
  - 有料オプション: 処理の追加 1件 +3,000円／シート3枚以上 +2,000円／お急ぎ（24時間以内）+2,000円。
- [ ] **Step 4: サムネイルを作る** — `thumbnail.html` は 1220×1240 の単一画面。大見出し「スプレッドシート作業を自動化」、小見出し「GAS で転記・集計・通知をおまかせ」、帯「手順書つき｜相談無料」。日本語フォントは `fc-list :lang=ja` で入っているものを指定し、無ければ `apt-get install -y fonts-noto-cjk`。`make-thumbnail.js` は Playwright で viewport 1220×1240、`deviceScaleFactor: 1` で `thumbnail.png` を撮る。撮った画像を Read で開き、文字化け（豆腐）と文字のはみ出しが無いことを目で確かめる。
- [ ] **Step 5: 合格を確認して Commit** — `node listing/make-thumbnail.js && pytest tests/test_listing.py -v` → PASS。`git add listing tests && git commit -m "feat: add listing copy and thumbnail"`。ここで人間に Task 0 Step 6 へ進めると伝える。

---

### Task 6: スケジュールタスクの作成と通し確認

**前提:** Task 1〜5 が `main` にマージ済み（PR は人間が頼んだときだけ作る。未マージなら人間にマージを依頼する）。Task 0 Step 8 の報告を受けている。

**Interfaces:**
- Consumes: `playbooks/*.md`（`main` ブランチ）、Gmail コネクタ。

- [ ] **Step 1: 納品タスクを作る** — `create_trigger`: name `RE1 依頼処理`、cron `CRON_TZ=Asia/Tokyo 7 8-22/2 * * *`（8〜22時の2時間おき）、`create_new_session_on_fire: true`、`connectors: ["Gmail"]`、`notifications: {push: true}`、`initiation: human_request`。prompt:

```
リポジトリ kouki0727mickey/real_earn_ver1 が作業ディレクトリに無ければ add_repo で追加して main を clone する。
CLAUDE.md を読み、playbooks/fulfil.md、続けて playbooks/propose.md を上から順にそのまま実行する。
どちらも対象メールが0件なら、何も作らず「対象なし」とだけ答えて終了する。
下書きを作ったら、件名の一覧だけを最後に報告する。リポジトリには push しない。
```

- [ ] **Step 2: 週次タスクを作る** — name `RE1 週次レビュー`、cron `CRON_TZ=Asia/Tokyo 43 20 * * 0`、他は同じ。prompt は上の2行目を「playbooks/weekly-review.md を上から順にそのまま実行する。」に替えたもの。
- [ ] **Step 3: 通し確認の準備（人間）** — 自分の Gmail から自分宛てに、件名 `[依頼] テスト`、本文に `fixtures/request-clear.md` の文面を貼って送る。もう1通、件名 `[売上] 3000`、本文なしで送る。
- [ ] **Step 4: 発火して確かめる** — `fire_trigger` で両タスクを1回ずつ動かす。`list_triggers` の `last_run.status` が SUCCEEDED。Gmail の下書きに `[納品案]` が1通（5節あり）と `[週次]` が1通（orders 1、net 2340、daily_avg_net 78.0）。`[依頼] テスト` に `RE1/処理済` が付いている。
- [ ] **Step 5: 二重処理が無いことを確かめる** — 納品タスクをもう一度 `fire_trigger`。新しい下書きが増えず「対象なし」で終わる。さらに、件名に「依頼」を含む下書き（例: 自分で `[お断り案] スクレイピング依頼` を下書き保存）を1通置いてから再発火し、その下書きが再処理されない（`-in:drafts` と接頭辞の条件）ことも確かめる。
- [ ] **Step 6: 失敗時の切り分け** — 新規セッションでリポジトリを読めない場合は `read_documentation`（topic `github.access`）に従う。Gmail が使えない場合は `create_trigger` の結果に出るコネクタ警告を人間にそのまま伝える。どちらも直らなければ、同じ prompt で `create_new_session_on_fire` を外し、このセッションに発火させる形に作り直す。
- [ ] **Step 7: 後片付け（人間）** — テストの下書き2通と `[売上] 3000` のテストメールを削除する（残すと週次集計に入る）。

---

### Task 7（人間 + 週次タスク）: 毎日の運用、価格、撤退基準

**毎日の作業（10〜20分）**

- [ ] **朝・夜の2回、ココナラアプリの通知を見る。**
  - 相談・購入が来ていたら: 依頼文をコピーし、氏名などを消して、自分宛てに件名 `[依頼] <一言>` で送る。最長2時間で Gmail の下書きに `[納品案]` か `[確認質問]` か `[お断り案]` が届く。
  - `[確認質問]` `[お断り案]`: 「お客様への返信文」を読み、おかしくなければトークルームに貼って送る。
  - `[納品案]`: 「人間が行う動作確認」のとおりに新規スプレッドシートで1回動かす。期待どおりなら返信文・コード・設置手順をトークルームに貼り（長ければテキストファイルにして添付）、正式な納品を行う。期待と違ったら、その様子を書き足して同じ件名で自分宛てに送り直す。
  - 取引が完了したら: 自分宛てに件名 `[売上] <販売額>` を送る（本文不要）。
- [ ] **評価が5件たまるまで、1日5分だけ公開依頼を見る。** ココナラの「仕事・相談を探す」で `GAS` `スプレッドシート` `自動化` を検索し、できそうな依頼の文面を件名 `[提案] <一言>` で自分宛てに送る。届いた `[提案案]` を読んで応募する。1日2件まで。

**価格ラダー**

| 条件 | 行うこと |
|---|---|
| 評価 5件 | 基本価格を 3,000 → 5,000円に上げる |
| 評価 15件、かつ直近30日で8件以上 | 5,000 → 8,000円に上げる |
| 同じ種類の依頼が3回来た | その処理専用の出品を1つ追加する（Claude に「出品文を作って」と頼む） |

**撤退基準**

| 時点 | 状態 | 行うこと |
|---|---|---|
| 出品から30日 | 相談 0件 | タイトル・サムネイル・1行目を作り直す。公開依頼への提案を1日3件に増やす |
| 出品から60日 | 直近30日の手取り 10,000円未満 | Excel VBA 版の出品を追加し、もう30日だけ続ける |
| 出品から90日 | 直近30日の手取り 15,000円未満 | この方法をやめ、0章の表の次点から選び直す |

売上（副業の所得）が年間20万円を超えると確定申告が必要になる。超えそうになったら税務署か税理士に確認する。
