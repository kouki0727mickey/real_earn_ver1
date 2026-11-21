from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PB = ROOT / "playbooks"


def read(name: str) -> str:
    return (PB / name).read_text(encoding="utf-8")


def test_fulfil_has_required_markers():
    text = read("fulfil.md")
    for marker in ["RE1/処理済", "未テスト箇所", "[確認質問]", "[お断り案]", "[納品案]", "node --test"]:
        assert marker in text, marker


def test_all_playbooks_state_hard_rules():
    for name in ["fulfil.md", "propose.md", "weekly-review.md"]:
        text = read(name)
        assert "外部連絡先" in text, name
        assert "コミットしない" in text, name


def test_propose_and_weekly_have_their_markers():
    assert "[提案案]" in read("propose.md")
    weekly = read("weekly-review.md")
    assert "[週次]" in weekly and "earn.ledger" in weekly


def test_fixtures_exist():
    for name in ["request-clear.md", "request-vague.md", "request-out-of-scope.md"]:
        assert (ROOT / "fixtures" / name).read_text(encoding="utf-8").strip(), name
