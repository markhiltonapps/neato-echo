#!/usr/bin/env python3
"""One-time migration: push desktop Neato Echo notes -> Neato Cloud (Supabase echo_recordings).

Run once:  python migrate_notes.py your@email
It will prompt for your Neato Cloud password (the account you created in the mobile app).
Idempotent: re-running updates the same rows (deterministic ids), never duplicates.
Reads a *copy* of the live DB, so it's safe while the desktop app is running.
"""
import os, sys, json, uuid, hashlib, shutil, tempfile, sqlite3, getpass, urllib.request, urllib.error

SUPABASE_URL = "https://djrgoduukyqarozqyxbu.supabase.co"
ANON_KEY = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
            "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqcmdvZHV1a3lxYXJvenF5eGJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODQzODksImV4cCI6MjA5MDU2MDM4OX0."
            "H6yqcj2KAr5bXqj82q9Kp0qbwxPEC6PcsLuccwm8hQA")

def post(path, body, token=None, prefer=None):
    headers = {"apikey": ANON_KEY, "Content-Type": "application/json"}
    if token: headers["Authorization"] = f"Bearer {token}"
    if prefer: headers["Prefer"] = prefer
    req = urllib.request.Request(SUPABASE_URL + path, data=json.dumps(body).encode(),
                                 headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode() or "{}"
            return r.status, (json.loads(raw) if raw.strip().startswith(("{", "[")) else raw)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def sign_in(email, password):
    status, data = post("/auth/v1/token?grant_type=password", {"email": email, "password": password})
    if status != 200 or not isinstance(data, dict) or "access_token" not in data:
        sys.exit(f"Sign-in failed ({status}): {data}")
    return data["access_token"], data["user"]["id"]

def copy_db():
    src = os.path.join(os.environ["APPDATA"], "neato-echo")
    tmp = tempfile.mkdtemp(prefix="neato-migrate-")
    for f in ("transcriptions.db", "transcriptions.db-wal", "transcriptions.db-shm"):
        p = os.path.join(src, f)
        if os.path.exists(p): shutil.copy2(p, os.path.join(tmp, f))
    return os.path.join(tmp, "transcriptions.db")

def det_uuid(nid): return str(uuid.UUID(hashlib.md5(f"desktop-note-{nid}".encode()).hexdigest()))

def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: python migrate_notes.py your@email")
    email = sys.argv[1]
    password = getpass.getpass("Neato Cloud password: ")
    print("Signing in…")
    token, uid = sign_in(email, password)
    print(f"Signed in as {email}")

    dbp = copy_db()
    db = sqlite3.connect(dbp); cur = db.cursor()
    rows = cur.execute("""select id,title,content,enhanced_content,transcript,audio_duration_seconds,created_at
                          from notes where deleted_at is null""").fetchall()
    payload = []
    for (nid, title, content, enh, transcript, dur, created) in rows:
        summary = (enh or content or "").strip()
        tr = (transcript or "").strip()
        if not summary and not tr:
            continue
        payload.append({
            "id": det_uuid(nid),
            "user_id": uid,
            "name": (title or "Untitled note").strip()[:200],
            "recorded_at": (created or "1970-01-01 00:00:00").replace(" ", "T") + "Z",
            "duration_ms": int(round((dur or 0) * 1000)),
            "transcript": tr or None,
            "summary": summary or None,
            "summary_type": None,
        })
    db.close()
    print(f"Pushing {len(payload)} notes…")
    sent = 0
    for i in range(0, len(payload), 20):
        batch = payload[i:i+20]
        status, resp = post("/rest/v1/echo_recordings?on_conflict=id", batch,
                            token=token, prefer="resolution=merge-duplicates,return=minimal")
        if status not in (200, 201, 204):
            sys.exit(f"Upsert failed ({status}): {resp}")
        sent += len(batch)
        print(f"  …{sent}/{len(payload)}")
    print(f"Done. {sent} notes are now in Neato Cloud. Open the mobile app -> Cloud -> Pull.")

if __name__ == "__main__":
    main()
