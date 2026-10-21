import importlib

from fastapi.testclient import TestClient


def test_spa_served_when_dist_exists(tmp_path, monkeypatch):
    import app.main as m
    dist = m._DIST
    created = not (dist / "index.html").exists()
    if created:
        dist.mkdir(parents=True, exist_ok=True)
        (dist / "index.html").write_text("<html>spa</html>")
        importlib.reload(m)
    try:
        c = TestClient(m.app)
        assert "spa" in c.get("/state/GA").text or "<html" in c.get("/state/GA").text
        assert c.get("/api/health").status_code == 200
        assert c.get("/api/nope").status_code == 404
        assert c.get("/openapi.json").status_code == 200
    finally:
        if created:
            (dist / "index.html").unlink()
            importlib.reload(m)
