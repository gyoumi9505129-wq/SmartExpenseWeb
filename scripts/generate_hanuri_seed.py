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


def _extract_balanced(text: str, open_idx: int) -> tuple[str, int]:
    """open_idx points at '(' ; return inner content and index after closing ')'."""
    depth = 0
    for i in range(open_idx, len(text)):
        ch = text[i]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return text[open_idx + 1 : i], i + 1
    raise ValueError(" unbalanced parentheses in DuesInitialData")


def _parse_dues_payments(record_src: str) -> list[dict]:
    payments: list[dict] = []
    for pm in re.finditer(
        r'DuesPaymentSeed\(\s*"([^"]+)"\s*,\s*(\d+)\s*\)',
        record_src,
    ):
        payments.append(
            {
                "payDate": pm.group(1),
                "amount": int(pm.group(2)),
                "linkedTransactionId": None,
            }
        )
    return payments


def _parse_dues_seed_record(record_src: str, name: str) -> dict | None:
    head = re.match(
        r'\s*(\d+)\s*,\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*"([^"]*)"\s*,\s*(true|false)'
        r"(?:\s*,\s*(\d+))?",
        record_src,
        re.S,
    )
    if not head:
        return None
    year, term, amount, pay, is_paid, paid_amt = head.groups()
    payments: list[dict] = []
    pay_list_m = re.search(r"payments\s*=\s*listOf\(", record_src)
    if pay_list_m:
        inner, _ = _extract_balanced(record_src, pay_list_m.end() - 1)
        payments = _parse_dues_payments(inner)

    y = int(year)
    amount_i = int(amount)
    if payments:
        paid = sum(p["amount"] for p in payments)
        pay_date = max((p["payDate"] for p in payments if p["payDate"]), default=pay)
    elif paid_amt:
        paid = int(paid_amt)
        pay_date = pay
        payments = (
            [{"payDate": pay, "amount": paid, "linkedTransactionId": None}]
            if paid > 0 and pay
            else []
        )
    else:
        paid = amount_i if is_paid == "true" else 0
        pay_date = pay
        payments = (
            [{"payDate": pay, "amount": paid, "linkedTransactionId": None}]
            if paid > 0 and pay
            else []
        )

    is_paid_bool = is_paid == "true" or (amount_i > 0 and paid >= amount_i)
    return {
        "id": f"seed_dd_{slug(name)}_{y}_{term}",
        "termLabel": term,
        "amount": amount_i,
        "paidAmount": paid,
        "isPaid": is_paid_bool,
        "isExcluded": False,
        "payDate": pay_date,
        "payments": payments,
        "_year": y,
    }


def parse_dues(text: str, name_to_id: dict[str, str]) -> list[dict]:
    """Group DuesSeedRecord under MemberDuesSeed by member name keys in mapOf."""
    dues_docs: list[dict] = []
    for m in re.finditer(
        r'"([^"]+)"\s+to\s+MemberDuesSeed\(\s*paymentMethod\s*=\s*DuesPaymentMethod\.(\w+)\s*,\s*records\s*=\s*listOf\(',
        text,
    ):
        name, method = m.groups()
        mid = name_to_id.get(name)
        body, _ = _extract_balanced(text, m.end() - 1)
        if not mid:
            continue

        by_year: dict[int, list[dict]] = {}
        idx = 0
        while True:
            start = body.find("DuesSeedRecord(", idx)
            if start < 0:
                break
            open_paren = start + len("DuesSeedRecord")
            record_src, end = _extract_balanced(body, open_paren)
            idx = end
            det = _parse_dues_seed_record(record_src, name)
            if not det:
                continue
            y = int(det.pop("_year"))
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
