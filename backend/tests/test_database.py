import os
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

# Point at an in-memory DB for tests
os.environ["DB_URL"] = "sqlite:///:memory:"

from database import Base, Beacon, init_db, upsert_beacon, get_all_beacons


@pytest.fixture(autouse=True)
def fresh_db():
    init_db()
    yield
    # Drop all tables after each test so state doesn't bleed
    Base.metadata.drop_all(bind=__import__("database").engine)


def test_upsert_inserts_new_beacon():
    beacon = {
        "uuid": "12345678-1234-1234-1234-123456789ABC",
        "major": 1, "minor": 2, "mac": "AA:BB:CC:DD:EE:FF",
        "tx_power": -59, "rssi": -61, "distance": "~1.3m",
        "last_seen": "2026-04-14T10:00:00"
    }
    upsert_beacon(beacon)
    rows = get_all_beacons()
    assert len(rows) == 1
    assert rows[0]["uuid"] == "12345678-1234-1234-1234-123456789ABC"
    assert rows[0]["major"] == 1


def test_upsert_updates_on_conflict():
    beacon = {
        "uuid": "12345678-1234-1234-1234-123456789ABC",
        "major": 1, "minor": 2, "mac": "AA:BB:CC:DD:EE:FF",
        "tx_power": -59, "rssi": -61, "distance": "~1.3m",
        "last_seen": "2026-04-14T10:00:00"
    }
    upsert_beacon(beacon)
    beacon["rssi"] = -50
    beacon["distance"] = "~0.5m"
    beacon["last_seen"] = "2026-04-14T11:00:00"
    upsert_beacon(beacon)
    rows = get_all_beacons()
    assert len(rows) == 1
    assert rows[0]["rssi"] == -50
    assert rows[0]["distance"] == "~0.5m"


def test_two_distinct_beacons_both_stored():
    b1 = {"uuid": "A", "major": 1, "minor": 1, "mac": "AA:BB:CC:DD:EE:FF",
          "tx_power": -59, "rssi": -61, "distance": "~1m", "last_seen": "2026-04-14T10:00:00"}
    b2 = {"uuid": "B", "major": 2, "minor": 2, "mac": "11:22:33:44:55:66",
          "tx_power": -59, "rssi": -70, "distance": "~3m", "last_seen": "2026-04-14T10:00:00"}
    upsert_beacon(b1)
    upsert_beacon(b2)
    rows = get_all_beacons()
    assert len(rows) == 2
