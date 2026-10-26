"""
백업 JSON의 histories → 웹 시드 + 앱 ClubHistoryInitialData.kt 갱신.

사용:
  python scripts/sync_history_seed_from_backup.py <backup.smartexpense.json>
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

WEB_ROOT = Path(__file__).resolve().parents[1]
SEED = WEB_ROOT / "public/seeds/hanuri-initial.smartexpense.json"
KOTLIN = (
    WEB_ROOT.parent
    / "SmartExpense/app/src/main/kotlin/com/smartexpense/data/local/seed/ClubHistoryInitialData.kt"
)


def to_iso(ms: int) -> str:
    d = datetime.fromtimestamp(ms / 1000)
    return f"{d.year:04d}-{d.month:02d}-{d.day:02d}"


def kotlin_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(
            "사용법: python scripts/sync_history_seed_from_backup.py <backup.json>"
        )
    backup_path = Path(sys.argv[1])
    if not backup_path.is_file():
        raise SystemExit(f"백업 파일이 없습니다: {backup_path}")
    if not KOTLIN.is_file():
        raise SystemExit(f"앱 시드 파일이 없습니다: {KOTLIN}")

    backup = json.loads(backup_path.read_text(encoding="utf-8"))
    seed = json.loads(SEED.read_text(encoding="utf-8"))
    rows = sorted(backup.get("histories") or [], key=lambda x: x.get("date") or 0)

    new_hist = []
    for i, h in enumerate(rows, 1):
        ms = int(h.get("date") or 0)
        note = h.get("note")
        new_hist.append(
            {
                "id": f"seed_hist_{i:03d}",
                "date": ms,
                "content": h.get("content") or "",
                "details": h.get("details") or "",
                "note": note if isinstance(note, str) and note.strip() else None,
            }
        )
    seed["histories"] = new_hist
    SEED.write_text(
        json.dumps(seed, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"seed histories → {len(new_hist)}")

    kt_lines: list[str] = []
    for h in new_hist:
        iso = to_iso(h["date"])
        content = kotlin_escape(h["content"])
        details = kotlin_escape(h["details"])
        note = h.get("note")
        if note:
            note_esc = kotlin_escape(note)
            kt_lines.append(
                "        ClubHistorySeedRecord(\n"
                f'            date = "{iso}",\n'
                f'            content = "{content}",\n'
                f'            details = "{details}",\n'
                f'            note = "{note_esc}"\n'
                "        ),"
            )
        else:
            kt_lines.append(
                f'        ClubHistorySeedRecord("{iso}", "{content}", "{details}"),'
            )

    kt = KOTLIN.read_text(encoding="utf-8")
    block = "\n".join(kt_lines)
    updated, n = re.subn(
        r"(val records: List<ClubHistorySeedRecord> = listOf\()(.*?)(\n    \))",
        rf"\1\n{block}\3",
        kt,
        count=1,
        flags=re.S,
    )
    if n != 1:
        raise SystemExit("ClubHistoryInitialData.kt records 블록을 찾지 못했습니다.")
    KOTLIN.write_text(updated, encoding="utf-8")
    print(f"updated {KOTLIN}")
    for h in new_hist:
        print(f"{to_iso(h['date'])} | {h['content']} | {h['details']}")


if __name__ == "__main__":
    main()
