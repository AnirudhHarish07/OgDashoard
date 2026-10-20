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
