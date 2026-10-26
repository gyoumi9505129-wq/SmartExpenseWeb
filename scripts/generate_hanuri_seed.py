#!/usr/bin/env python3
"""앱 Kotlin 시드 → 웹 백업 JSON (hanuri-initial.smartexpense.json)"""
from __future__ import annotations

import json
import re
from pathlib import Path

APP_SEED = Path(r"c:\AiDev\SmartExpense\app\src\main\kotlin\com\smartexpense\data\local\seed")
OUT = Path(r"c:\AiDev\SmartExpenseWeb\public\seeds\hanuri-initial.smartexpense.json")


def slug(name: str) -> str:
    return "seed_" + re.sub(r"[^0-9A-Za-z가-힣]+", "_", name).strip("_")


def parse_members(text: str) -> list[dict]:
    # MemberSeed(name = "...", phone = "...", joinDate = "...", residenceRegion = "...", ...)
    members = []
    for m in re.finditer(
        r'MemberSeed\(\s*name\s*=\s*"([^"]+)"\s*,\s*phone\s*=\s*"([^"]*)"\s*,\s*joinDate\s*=\s*"(\d+)"\s*,\s*residenceRegion\s*=\s*"([^"]*)"([^)]*)\)',
        text,
    ):
        name, phone, jd, region, rest = m.groups()
        status = "ACTIVE"
        role = "GENERAL"
        if "MemberStatus.DORMANT" in rest:
            status = "DORMANT"
        elif "MemberStatus.WITHDRAWN" in rest:
            status = "WITHDRAWN"
        if "MemberRole.PRESIDENT" in rest:
            role = "PRESIDENT"
        elif "MemberRole.TREASURER" in rest:
            role = "TREASURER"
        digits = re.sub(r"\D", "", jd)
        join = f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}" if len(digits) >= 8 else ""
        members.append(
            {
                "id": slug(name),
                "name": name,
                "status": status,
                "joinDate": join,
                "phone": phone,
                "email": "",
                "role": role,
                "linkedUid": "",
                "residenceRegion": region,
            }
        )
    return members


def parse_transactions(text: str) -> list[dict]:
    rows = []
    for i, m in enumerate(
        re.finditer(
            r'TransactionSeedRecord\(\s*"([^"]+)"\s*,\s*ClubTransactionType\.(INCOME|EXPENSE)\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*"([^"]*)"',
            text,
        )
    ):
        date, typ, cat, income, expense, note = m.groups()
        income_i, expense_i = int(income), int(expense)
        amount = income_i if typ == "INCOME" else expense_i
        rows.append(
            {
                "id": f"seed_tx_{i+1:04d}",
                "date": date,
                "type": typ,
                "category": cat,
                "description": note,
                "amount": amount,
                "incomeAmount": income_i,
                "expenseAmount": expense_i,
                "memberId": None,
                "note": note,
                "linkedDuesDetailId": None,
            }
        )
    return rows


def parse_histories(text: str) -> list[dict]:
    rows = []
    # ClubHistorySeedRecord("date", "content", "details") or named args
    for i, m in enumerate(
        re.finditer(
            r'ClubHistorySeedRecord\(\s*(?:date\s*=\s*)?"([^"]+)"\s*,\s*(?:content\s*=\s*)?"([^"]+)"\s*,\s*(?:details\s*=\s*)?"([^"]*)"(?:\s*,\s*(?:note\s*=\s*)?"([^"]*)")?',
            text,
        )
    ):
        date_s, content, details, note = m.groups()
        # local date noon KST-ish as ms
        y, mo, d = map(int, date_s.split("-"))
        import datetime

        dt = datetime.datetime(y, mo, d, 12, 0, 0)
        ms = int(dt.timestamp() * 1000)
        rows.append(
            {
                "id": f"seed_hist_{i+1:03d}",
                "date": ms,
                "content": content,
                "details": details,
                "note": note,
            }
        )
    return rows


def parse_events(text: str, name_to_id: dict[str, str]) -> list[dict]:
    rows = []
    for i, m in enumerate(
        re.finditer(
            r'EventExpenseSeedRecord\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*\)',
            text,
        )
    ):
        name, sub, amount = m.groups()
        mid = name_to_id.get(name)
        if not mid:
            continue
        rows.append(
            {
                "id": f"seed_ev_{i+1:03d}",
                "memberId": mid,
                "date": "2025-01-01",
                "eventSubCategory": sub,
                "amount": int(amount),
                "note": "",
                "linkedTransactionId": None,
                "isSeedOnly": True,
            }
        )
    return rows


def parse_dues(text: str, name_to_id: dict[str, str]) -> list[dict]:
    """Group DuesSeedRecord under MemberDuesSeed by member name keys in mapOf."""
    # Split by "Name" to MemberDuesSeed
    dues_docs: list[dict] = []
    for block in re.finditer(
        r'"([^"]+)"\s+to\s+MemberDuesSeed\(\s*paymentMethod\s*=\s*DuesPaymentMethod\.(\w+)\s*,\s*records\s*=\s*listOf\((.*?)\)\s*\)',
        text,
        re.S,
    ):
        name, method, body = block.groups()
        mid = name_to_id.get(name)
        if not mid:
            continue
        by_year: dict[int, list[dict]] = {}
        for rm in re.finditer(
            r'DuesSeedRecord\(\s*(\d+)\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*"([^"]*)"\s*,\s*(true|false)(?:\s*,\s*(\d+))?',
            body,
        ):
            year, term, amount, pay, is_paid, paid_amt = rm.groups()
            y = int(year)
            amount_i = int(amount)
            paid = int(paid_amt) if paid_amt else (amount_i if is_paid == "true" else 0)
            det = {
                "id": f"seed_dd_{slug(name)}_{y}_{term}",
                "termLabel": term,
                "amount": amount_i,
                "paidAmount": paid,
                "isPaid": is_paid == "true",
                "isExcluded": False,
                "payDate": pay,
                "payments": (
                    [{"payDate": pay, "amount": paid, "linkedTransactionId": None}]
                    if paid > 0 and pay
                    else []
                ),
            }
            by_year.setdefault(y, []).append(det)
        for y, details in sorted(by_year.items()):
            total = sum(d["amount"] for d in details)
            dues_docs.append(
                {
                    "id": f"seed_dues_{slug(name)}_{y}",
                    "memberId": mid,
                    "memberName": name,
                    "year": y,
                    "totalTargetAmount": total,
                    "paymentMethod": method,
                    "details": details,
                    "paidAmount": sum(d["paidAmount"] for d in details),
                    "status": "",
                }
            )
    return dues_docs


def main() -> None:
    members = parse_members((APP_SEED / "MemberInitialData.kt").read_text(encoding="utf-8"))
    name_to_id = {m["name"]: m["id"] for m in members}
    transactions = parse_transactions(
        (APP_SEED / "TransactionInitialData.kt").read_text(encoding="utf-8")
    )
    histories = parse_histories(
        (APP_SEED / "ClubHistoryInitialData.kt").read_text(encoding="utf-8")
    )
    events = parse_events(
        (APP_SEED / "EventExpenseInitialData.kt").read_text(encoding="utf-8"),
        name_to_id,
    )
    dues = parse_dues(
        (APP_SEED / "DuesInitialData.kt").read_text(encoding="utf-8"), name_to_id
    )
    accounts = [
        {
            "id": "seed_account_hana",
            "bankName": "하나은행",
            "accountNumber": "47391022275807",
            "holderName": "김성겸",
        }
    ]
    income = sum(t["incomeAmount"] for t in transactions)
    expense = sum(t["expenseAmount"] for t in transactions)
    balance = income - expense

    payload = {
        "format": "smartexpense-meeting-backup",
        "version": 1,
        "exportedAt": "2026-10-26T15:00:00.000Z",
        "meeting": {
            "name": "한우리",
            "slogan": "友情과 信義로 하나되는 한우리",
            "description": "",
            "duesPaymentMethod": "HALF_YEARLY",
            "initialBalance": 0,
            "currentBalance": balance,
        },
        "members": members,
        "transactions": transactions,
        "dues": dues,
        "eventExpenses": events,
        "histories": histories,
        "accounts": accounts,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"Wrote {OUT} members={len(members)} tx={len(transactions)} "
        f"dues={len(dues)} events={len(events)} hist={len(histories)} balance={balance}"
    )


if __name__ == "__main__":
    main()
