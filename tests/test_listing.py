import struct
from pathlib import Path

LISTING = Path(__file__).resolve().parent.parent / "listing"


def test_service_copy_has_sections_and_disclosure():
    text = (LISTING / "service.md").read_text(encoding="utf-8")
    for heading in ["## サービス内容", "## 購入にあたってのお願い", "## 有料オプション"]:
        assert heading in text, heading
    assert "AI" in text and "動作確認" in text
    assert "http" not in text and "@" not in text


def test_thumbnail_is_1220x1240_and_under_2mb():
    data = (LISTING / "thumbnail.png").read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    assert struct.unpack(">II", data[16:24]) == (1220, 1240)
    assert len(data) < 2 * 1024 * 1024
