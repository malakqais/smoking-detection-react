"""Violation dispute workflow: user → manager → admins vote → supervisor decides."""
import json
import datetime

from config import DB_PATH
from rbac import normalize_role

DISPUTE_REASONS = [
    {"id": "not_smoking", "label": "I was not smoking"},
    {"id": "wrong_item", "label": "Misidentified object (not cigarette/vape)"},
    {"id": "wrong_person", "label": "Wrong person in the frame"},
    {"id": "poor_quality", "label": "Poor image / cannot verify"},
    {"id": "wrong_location", "label": "Wrong location or camera"},
    {"id": "other", "label": "Other mistake"},
]

STATUS_PENDING_MANAGER = "pending_manager"
STATUS_PENDING_ADMIN = "pending_admin"
STATUS_AWAITING_SUPERVISOR = "awaiting_supervisor"
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"

_DISPUTE_SELECT = """
    SELECT d.id, d.violation_id, d.user_id, d.reasons_json, d.user_note, d.status,
           d.created_at, d.updated_at, d.supervisor_note,
           d.manager_reviewer_id, d.manager_decision, d.manager_note, d.manager_reviewed_at,
           v.timestamp, v.location, v.person_name, v.detected_type, v.image_path,
           u.name, u.email,
           mr.name AS manager_reviewer_name
    FROM violation_disputes d
    JOIN violations v ON v.id = d.violation_id
    JOIN users u ON u.id = d.user_id
    LEFT JOIN users mr ON mr.id = d.manager_reviewer_id
"""


def _connect():
    import sqlite3
    return sqlite3.connect(DB_PATH)


def _now():
    return datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def list_admin_ids(conn):
    rows = conn.execute(
        """SELECT id FROM users
           WHERE role = 'admin' AND COALESCE(account_status, 'active') = 'active'"""
    ).fetchall()
    return [r[0] for r in rows]


def _admin_roster(conn, dispute_id):
    votes = {v["admin_id"]: v for v in _fetch_votes(conn, dispute_id)}
    rows = conn.execute(
        """SELECT id, name, email FROM users
           WHERE role = 'admin' AND COALESCE(account_status, 'active') = 'active'
           ORDER BY name"""
    ).fetchall()
    roster = []
    for aid, name, email in rows:
        voted = votes.get(aid)
        roster.append({
            "admin_id": aid,
            "admin_name": name,
            "admin_email": email,
            "vote": voted["vote"] if voted else None,
            "voted_at": voted["created_at"] if voted else None,
        })
    return roster


def violation_belongs_to_user(conn, violation_id, user):
    row = conn.execute(
        "SELECT id, person_name, user_id FROM violations WHERE id = ?",
        (violation_id,),
    ).fetchone()
    if not row:
        return None, "Violation not found"
    _vid, person_name, uid = row
    if uid and int(uid) == int(user["id"]):
        return row, None
    if (person_name or "").strip().lower() == (user.get("name") or "").strip().lower():
        return row, None
    return None, "This violation is not linked to your account"


def create_dispute(user, violation_id, reasons, note=""):
    if not reasons:
        return None, "Select at least one reason for the dispute"
    valid_ids = {r["id"] for r in DISPUTE_REASONS}
    cleaned = [r for r in reasons if r in valid_ids]
    if not cleaned:
        return None, "Invalid dispute reasons"

    conn = _connect()
    row, err = violation_belongs_to_user(conn, violation_id, user)
    if err:
        conn.close()
        return None, err

    existing = conn.execute(
        """SELECT id FROM violation_disputes
           WHERE violation_id = ? AND status NOT IN (?, ?)""",
        (violation_id, STATUS_APPROVED, STATUS_REJECTED),
    ).fetchone()
    if existing:
        conn.close()
        return None, "A dispute for this violation is already in progress"

    conn.execute(
        """INSERT INTO violation_disputes
           (violation_id, user_id, reasons_json, user_note, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            violation_id,
            user["id"],
            json.dumps(cleaned),
            (note or "").strip()[:2000],
            STATUS_PENDING_MANAGER,
            _now(),
            _now(),
        ),
    )
    dispute_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    conn.close()
    return dispute_id, None


def _dispute_row_to_dict(row, votes=None, admin_roster=None):
    if not row:
        return None
    keys = (
        "id", "violation_id", "user_id", "reasons_json", "user_note", "status",
        "created_at", "updated_at", "supervisor_note",
        "manager_reviewer_id", "manager_decision", "manager_note", "manager_reviewed_at",
        "v_timestamp", "v_location", "v_person", "v_type", "v_image",
        "user_name", "user_email", "manager_reviewer_name",
    )
    data = dict(zip(keys, row))
    try:
        data["reasons"] = json.loads(data.pop("reasons_json") or "[]")
    except json.JSONDecodeError:
        data["reasons"] = []
    data["votes"] = votes or []
    data["admin_roster"] = admin_roster or []
    if data.get("v_image"):
        data["v_image_url"] = "/" + str(data["v_image"]).lstrip("/")
    else:
        data["v_image_url"] = ""
    return data


def _enrich_dispute(conn, row):
    did = row[0]
    votes = _fetch_votes(conn, did)
    roster = _admin_roster(conn, did)
    d = _dispute_row_to_dict(row, votes, roster)
    d["admin_total"] = len(roster)
    d["admin_voted"] = sum(1 for a in roster if a["vote"])
    d["votes_valid"] = sum(1 for v in votes if v["vote"] == "valid")
    d["votes_invalid"] = sum(1 for v in votes if v["vote"] == "invalid")
    return d


def _fetch_votes(conn, dispute_id):
    rows = conn.execute(
        """SELECT v.admin_id, u.name, u.email, v.vote, v.created_at
           FROM dispute_admin_votes v
           JOIN users u ON u.id = v.admin_id
           WHERE v.dispute_id = ?
           ORDER BY v.created_at ASC""",
        (dispute_id,),
    ).fetchall()
    return [
        {
            "admin_id": r[0],
            "admin_name": r[1],
            "admin_email": r[2],
            "vote": r[3],
            "vote_label": "Yes — mistake" if r[3] == "valid" else "No — violation stands",
            "created_at": r[4],
        }
        for r in rows
    ]


def list_disputes_for_user(user_id):
    conn = _connect()
    rows = conn.execute(
        _DISPUTE_SELECT + " WHERE d.user_id = ? ORDER BY d.created_at DESC",
        (user_id,),
    ).fetchall()
    result = [_enrich_dispute(conn, r) for r in rows]
    conn.close()
    return result


def list_disputes_for_staff():
    conn = _connect()
    rows = conn.execute(
        _DISPUTE_SELECT + """
        ORDER BY
          CASE d.status
            WHEN 'pending_manager' THEN 0
            WHEN 'awaiting_supervisor' THEN 1
            WHEN 'pending_admin' THEN 2
            ELSE 3
          END,
          d.created_at DESC"""
    ).fetchall()
    result = [_enrich_dispute(conn, r) for r in rows]
    conn.close()
    return result


def get_dispute(dispute_id):
    conn = _connect()
    row = conn.execute(
        _DISPUTE_SELECT + " WHERE d.id = ?",
        (dispute_id,),
    ).fetchone()
    if not row:
        conn.close()
        return None
    d = _enrich_dispute(conn, row)
    conn.close()
    return d


def _maybe_escalate_to_supervisor(conn, dispute_id):
    admin_ids = list_admin_ids(conn)
    if not admin_ids:
        conn.execute(
            "UPDATE violation_disputes SET status = ?, updated_at = ? WHERE id = ?",
            (STATUS_AWAITING_SUPERVISOR, _now(), dispute_id),
        )
        return
    votes = conn.execute(
        "SELECT admin_id FROM dispute_admin_votes WHERE dispute_id = ?",
        (dispute_id,),
    ).fetchall()
    voted = {r[0] for r in votes}
    if all(aid in voted for aid in admin_ids):
        conn.execute(
            "UPDATE violation_disputes SET status = ?, updated_at = ? WHERE id = ?",
            (STATUS_AWAITING_SUPERVISOR, _now(), dispute_id),
        )


def cast_manager_review(manager, dispute_id, decision, note=""):
    role = normalize_role(manager["role"])
    if role not in ("manager", "supervisor"):
        return None, "Only managers or the supervisor can review at this stage"

    decision = (decision or "").strip().lower()
    if decision not in ("escalate", "reject", "remove"):
        return None, "Decision must be escalate, reject, or remove"

    conn = _connect()
    row = conn.execute(
        "SELECT id, violation_id, status FROM violation_disputes WHERE id = ?",
        (dispute_id,),
    ).fetchone()
    if not row:
        conn.close()
        return None, "Dispute not found"
    _did, violation_id, status = row
    if status != STATUS_PENDING_MANAGER:
        conn.close()
        return None, "This dispute is not awaiting manager review"

    note = (note or "").strip()[:2000]
    if decision == "escalate":
        new_status = STATUS_PENDING_ADMIN
        msg = "Sent to admins for vote"
    elif decision == "reject":
        new_status = STATUS_REJECTED
        msg = "Dispute rejected — violation kept"
    else:
        new_status = STATUS_APPROVED
        conn.execute("DELETE FROM violations WHERE id = ?", (violation_id,))
        msg = "Violation removed — mistake confirmed by manager"

    conn.execute(
        """UPDATE violation_disputes
           SET status = ?, manager_reviewer_id = ?, manager_decision = ?,
               manager_note = ?, manager_reviewed_at = ?, updated_at = ?
           WHERE id = ?""",
        (new_status, manager["id"], decision, note, _now(), _now(), dispute_id),
    )
    conn.commit()
    conn.close()
    return get_dispute(dispute_id), msg


def cast_admin_vote(admin, dispute_id, vote):
    if normalize_role(admin["role"]) != "admin":
        return None, "Only admins can vote on disputes"
    vote = (vote or "").strip().lower()
    if vote not in ("valid", "invalid"):
        return None, "Vote must be valid (yes) or invalid (no)"

    conn = _connect()
    dispute = conn.execute(
        "SELECT id, status FROM violation_disputes WHERE id = ?",
        (dispute_id,),
    ).fetchone()
    if not dispute:
        conn.close()
        return None, "Dispute not found"
    if dispute[1] != STATUS_PENDING_ADMIN:
        conn.close()
        return None, "This dispute is not accepting admin votes"

    conn.execute(
        """INSERT INTO dispute_admin_votes (dispute_id, admin_id, vote, created_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(dispute_id, admin_id) DO UPDATE SET
             vote = excluded.vote, created_at = excluded.created_at""",
        (dispute_id, admin["id"], vote, _now()),
    )
    _maybe_escalate_to_supervisor(conn, dispute_id)
    conn.commit()
    conn.close()
    return get_dispute(dispute_id), None


def supervisor_decide(supervisor, dispute_id, decision, note=""):
    if normalize_role(supervisor["role"]) != "supervisor":
        return None, "Only the supervisor can make the final decision"
    decision = (decision or "").strip().lower()
    if decision not in ("approve", "reject"):
        return None, "Decision must be approve or reject"

    conn = _connect()
    row = conn.execute(
        "SELECT id, violation_id, status FROM violation_disputes WHERE id = ?",
        (dispute_id,),
    ).fetchone()
    if not row:
        conn.close()
        return None, "Dispute not found"
    _did, violation_id, status = row
    if status != STATUS_AWAITING_SUPERVISOR:
        conn.close()
        return None, "Dispute is not ready for supervisor review"

    if decision == "approve":
        conn.execute("DELETE FROM violations WHERE id = ?", (violation_id,))
        new_status = STATUS_APPROVED
        msg = "Dispute approved — violation removed"
    else:
        new_status = STATUS_REJECTED
        msg = "Dispute rejected — violation kept"

    conn.execute(
        """UPDATE violation_disputes
           SET status = ?, supervisor_note = ?, updated_at = ?
           WHERE id = ?""",
        (new_status, (note or "").strip()[:2000], _now(), dispute_id),
    )
    conn.commit()
    conn.close()
    return get_dispute(dispute_id), msg
