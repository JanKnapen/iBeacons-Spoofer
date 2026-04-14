import re
import subprocess

from flask import Flask, jsonify, request
from flask_cors import CORS

from database import init_db, get_all_beacons, upsert_beacon
from scanner import Scanner
from spoofer import Spoofer

app = Flask(__name__)
CORS(app)

state = {
    "adapter": "hci0",
    "scanning": False,
    "spoofing": False,
    "spoof_target": None,
}

_scanner = Scanner(upsert_fn=upsert_beacon)
_spoofer = Spoofer()


def list_adapters():
    result = subprocess.run(
        ["sudo", "hciconfig"], capture_output=True, text=True
    )
    return re.findall(r"^(hci\d+):", result.stdout, re.MULTILINE)


@app.get("/api/status")
def get_status():
    return jsonify(state)


@app.get("/api/adapters")
def get_adapters():
    return jsonify(list_adapters())


@app.put("/api/adapter")
def put_adapter():
    if state["scanning"] or state["spoofing"]:
        return jsonify({"error": "Cannot change adapter while scanning or spoofing"}), 409
    adapter = request.json.get("adapter")
    available = list_adapters()
    if adapter not in available:
        return jsonify({"error": f"Adapter {adapter!r} not found. Available: {available}"}), 400
    state["adapter"] = adapter
    return jsonify(state)


# ── Scan endpoints ──────────────────────────────────────────────────────────

@app.post("/api/scan/start")
def scan_start():
    if state["spoofing"]:
        return jsonify({"error": "Cannot scan while spoofing"}), 409
    if state["scanning"]:
        return jsonify(state)
    try:
        _scanner.start(state["adapter"])
        state["scanning"] = True
        return jsonify(state)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.post("/api/scan/stop")
def scan_stop():
    _scanner.stop()
    state["scanning"] = False
    return jsonify(state)


@app.get("/api/beacons")
def get_beacons():
    return jsonify(get_all_beacons())


# ── Spoof endpoints ─────────────────────────────────────────────────────────

@app.post("/api/spoof/start")
def spoof_start():
    body = request.json or {}
    uuid = body.get("uuid")
    major = body.get("major")
    minor = body.get("minor")
    tx_power = body.get("tx_power", -59)
    if not uuid or major is None or minor is None:
        return jsonify({"error": "uuid, major, and minor are required"}), 400
    # Auto-stop scanning before advertising
    if state["scanning"]:
        _scanner.stop()
        state["scanning"] = False
    try:
        _spoofer.start(state["adapter"], uuid, int(major), int(minor), int(tx_power))
        state["spoofing"] = True
        state["spoof_target"] = {"uuid": uuid, "major": major, "minor": minor}
        return jsonify(state)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.post("/api/spoof/stop")
def spoof_stop():
    try:
        _spoofer.stop(state["adapter"])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500
    state["spoofing"] = False
    state["spoof_target"] = None
    return jsonify(state)


if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
