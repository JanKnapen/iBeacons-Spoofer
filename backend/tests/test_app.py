import os
os.environ["DB_URL"] = "sqlite:///:memory:"

import pytest
from unittest.mock import patch
import json

from app import app, state
from database import init_db, Base, engine


@pytest.fixture(autouse=True)
def setup_db():
    init_db()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


@pytest.fixture(autouse=True)
def reset_state():
    state.update({"adapter": "hci0", "scanning": False, "spoofing": False, "spoof_target": None})
    yield


def test_get_status(client):
    res = client.get("/api/status")
    assert res.status_code == 200
    data = json.loads(res.data)
    assert data["adapter"] == "hci0"
    assert data["scanning"] is False
    assert data["spoofing"] is False


def test_put_adapter_success(client):
    with patch("app.list_adapters", return_value=["hci0", "hci1"]):
        res = client.put("/api/adapter", json={"adapter": "hci1"})
    assert res.status_code == 200
    assert state["adapter"] == "hci1"


def test_put_adapter_rejected_while_scanning(client):
    state["scanning"] = True
    with patch("app.list_adapters", return_value=["hci0", "hci1"]):
        res = client.put("/api/adapter", json={"adapter": "hci1"})
    assert res.status_code == 409


def test_put_adapter_rejected_while_spoofing(client):
    state["spoofing"] = True
    with patch("app.list_adapters", return_value=["hci0", "hci1"]):
        res = client.put("/api/adapter", json={"adapter": "hci1"})
    assert res.status_code == 409


def test_put_adapter_unknown_adapter_rejected(client):
    with patch("app.list_adapters", return_value=["hci0"]):
        res = client.put("/api/adapter", json={"adapter": "hci99"})
    assert res.status_code == 400


def test_get_adapters(client):
    with patch("app.list_adapters", return_value=["hci0", "hci1"]):
        res = client.get("/api/adapters")
    assert res.status_code == 200
    assert json.loads(res.data) == ["hci0", "hci1"]


def test_scan_start_sets_state(client):
    with patch("app._scanner.start") as mock_start:
        res = client.post("/api/scan/start")
    assert res.status_code == 200
    mock_start.assert_called_once_with("hci0")
    assert state["scanning"] is True


def test_scan_start_rejected_while_spoofing(client):
    state["spoofing"] = True
    res = client.post("/api/scan/start")
    assert res.status_code == 409


def test_scan_start_idempotent_when_already_scanning(client):
    state["scanning"] = True
    with patch("app._scanner.start") as mock_start:
        res = client.post("/api/scan/start")
    mock_start.assert_not_called()
    assert res.status_code == 200


def test_scan_stop_clears_state(client):
    state["scanning"] = True
    with patch("app._scanner.stop"):
        res = client.post("/api/scan/stop")
    assert res.status_code == 200
    assert state["scanning"] is False


def test_get_beacons_returns_list(client):
    from database import upsert_beacon
    upsert_beacon({
        "uuid": "AAAA-1234-1234-1234-123456789ABC",
        "major": 1, "minor": 2, "mac": "AA:BB:CC:DD:EE:FF",
        "tx_power": -59, "rssi": -61, "distance": "~1m",
        "last_seen": "2026-04-14T10:00:00"
    })
    res = client.get("/api/beacons")
    assert res.status_code == 200
    data = json.loads(res.data)
    assert len(data) == 1
    assert data[0]["major"] == 1


def test_scan_start_returns_error_on_subprocess_failure(client):
    with patch("app._scanner.start", side_effect=Exception("hci0: no such device")):
        res = client.post("/api/scan/start")
    assert res.status_code == 500
    assert "hci0: no such device" in json.loads(res.data)["error"]


def test_spoof_start_sets_state(client):
    with patch("app._spoofer.start") as mock_start:
        res = client.post("/api/spoof/start", json={
            "uuid": "12345678-1234-1234-1234-123456789ABC",
            "major": 1, "minor": 2, "tx_power": -59
        })
    assert res.status_code == 200
    mock_start.assert_called_once_with("hci0", "12345678-1234-1234-1234-123456789ABC", 1, 2, -59)
    assert state["spoofing"] is True
    assert state["spoof_target"]["major"] == 1


def test_spoof_start_auto_stops_scan(client):
    state["scanning"] = True
    with patch("app._scanner.stop") as mock_stop, \
         patch("app._spoofer.start"):
        client.post("/api/spoof/start", json={
            "uuid": "12345678-1234-1234-1234-123456789ABC",
            "major": 1, "minor": 2, "tx_power": -59
        })
    mock_stop.assert_called_once()
    assert state["scanning"] is False


def test_spoof_start_requires_uuid(client):
    res = client.post("/api/spoof/start", json={"major": 1, "minor": 2})
    assert res.status_code == 400


def test_spoof_stop_clears_state(client):
    state["spoofing"] = True
    state["spoof_target"] = {"uuid": "X", "major": 1, "minor": 1}
    with patch("app._spoofer.stop"):
        res = client.post("/api/spoof/stop")
    assert res.status_code == 200
    assert state["spoofing"] is False
    assert state["spoof_target"] is None


def test_spoof_start_returns_error_on_failure(client):
    with patch("app._spoofer.start", side_effect=RuntimeError("no adapter")):
        res = client.post("/api/spoof/start", json={
            "uuid": "12345678-1234-1234-1234-123456789ABC",
            "major": 1, "minor": 2, "tx_power": -59
        })
    assert res.status_code == 500
    assert "no adapter" in json.loads(res.data)["error"]
