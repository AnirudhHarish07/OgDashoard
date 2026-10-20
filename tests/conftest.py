import logging

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import data


@pytest.fixture(scope="session")
def client():
    logging.disable(logging.INFO)
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def annual():
    return data.frames().tourism_annual


@pytest.fixture()
def fresh_caches():
    from app.services import cache
    cache.clear_all()
    yield
    cache.clear_all()


@pytest.fixture()
def fake_ai(monkeypatch, fresh_caches):
    """Pretend an API key exists; tests set `handler` to control what 'Claude' returns."""
    from app.services import ai

    class Fake:
        handler = None
        calls = []

    monkeypatch.setattr(ai, "available", lambda: True)

    def complete_json(system, user, schema, max_tokens=2000):
        Fake.calls.append((system, user))
        return Fake.handler(system, user)

    monkeypatch.setattr(ai, "complete_json", complete_json)
    Fake.calls = []
    return Fake
