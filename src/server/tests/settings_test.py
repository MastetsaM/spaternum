"""Server side of planning/specs/favorites_spec.md: the synced settings table."""

import uuid

T0 = "2026-10-28T10:00:00.000Z"
T1 = "2026-10-28T11:00:00.000Z"


def setting(id, value, updated=T0):
    return {
        "id": id,
        "key": "favorite_tools",
        "value": value,
        "created_at": T0,
        "updated_at": updated,
        "_deleted": False,
    }


def push(client, *docs):
    response = client.post("/api/settings/settings/push", json=list(docs))
    assert response.status_code == 200, response.text
    return response.json()


def pull(client, seq=0):
    response = client.get(f"/api/settings/settings/pull?seq={seq}")
    assert response.status_code == 200, response.text
    return response.json()


def test_setting_syncs_and_latest_write_wins(client):
    id = str(uuid.uuid4())
    assert push(client, setting(id, '["notes"]')) == []
    # Two devices write the same row (fixed id per key); the later one wins
    assert push(client, setting(id, '["archive", "notes"]', updated=T1)) == []
    conflicts = push(client, setting(id, '["voice-notes"]'))
    assert [c["value"] for c in conflicts] == ['["archive", "notes"]']

    docs = [d for d in pull(client)["documents"] if d["id"] == id]
    assert [d["value"] for d in docs] == ['["archive", "notes"]']


def test_settings_need_the_token(app):
    from fastapi.testclient import TestClient

    with TestClient(app) as c:
        assert c.get("/api/settings/settings/pull").status_code == 401
