# 売上メール → 週次レポートの下書き

実行前に `CLAUDE.md` を読むこと。

1. Gmail を `from:me to:me subject:[売上] newer_than:31d` で検索する。ラベルは付けない（毎週数え直すため）。
2. 各スレッドの受信日と件名を `YYYY-MM-DD<TAB>件名` の1行にして、`python3 -m earn.ledger --today <今日 YYYY-MM-DD>` の標準入力へ流す。標準出力の JSON が集計。標準エラーの `WARN:` 行は解釈できなかった件名。
3. 過去7日の `[依頼]` と `[提案]` の件数を、同じ検索（ラベル条件なし、`newer_than:7d`）で数える。
4. 自分宛てに下書き `[週次] <今日> 日平均<daily_avg_net>円` を作る。本文に入れるもの:
   - 集計の全項目（orders, gross, net, daily_avg_net, gap_per_day, orders_needed_at_5000）
   - `WARN:` 行（あれば）
   - 過去7日の `[依頼]` `[提案]` の件数
   - 「今週やること」を最大3つ。`docs/superpowers/plans/2026-11-21-coconala-gas-automation.md` の Task 7 の価格ラダーと撤退基準に照らして決める。
5. 外部連絡先を書かない。顧客の文面・氏名・メールアドレスをコミットしない。リポジトリへは push しない。最後に、作った下書きの件名だけを報告する。
