import os
from sqlalchemy import create_engine, Column, Integer, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Session

_default_url = f"sqlite:///{os.path.join(os.path.dirname(__file__), 'beacons.db')}"
DATABASE_URL = os.environ.get("DB_URL", _default_url)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


class Base(DeclarativeBase):
    pass


class Beacon(Base):
    __tablename__ = "beacons"
    id = Column(Integer, primary_key=True, autoincrement=True)
    uuid = Column(Text, nullable=False)
    major = Column(Integer, nullable=False)
    minor = Column(Integer, nullable=False)
    mac = Column(Text)
    tx_power = Column(Integer)
    rssi = Column(Integer)
    distance = Column(Text)
    last_seen = Column(Text)
    __table_args__ = (UniqueConstraint("uuid", "major", "minor", "mac"),)


def init_db():
    Base.metadata.create_all(engine)


def upsert_beacon(beacon_dict):
    with Session(engine) as session:
        existing = session.query(Beacon).filter_by(
            uuid=beacon_dict["uuid"],
            major=beacon_dict["major"],
            minor=beacon_dict["minor"],
            mac=beacon_dict["mac"],
        ).first()
        if existing:
            existing.rssi = beacon_dict["rssi"]
            existing.distance = beacon_dict["distance"]
            existing.last_seen = beacon_dict["last_seen"]
        else:
            session.add(Beacon(**beacon_dict))
        session.commit()


def get_all_beacons():
    with Session(engine) as session:
        rows = session.query(Beacon).all()
        return [
            {
                "id": b.id, "uuid": b.uuid, "major": b.major, "minor": b.minor,
                "mac": b.mac, "tx_power": b.tx_power, "rssi": b.rssi,
                "distance": b.distance, "last_seen": b.last_seen,
            }
            for b in rows
        ]
