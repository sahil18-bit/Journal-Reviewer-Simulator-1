"""Tests for the rule-based review endpoints."""

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.api

MANUSCRIPT = (
    "Abstract: This paper studies a sample problem and summarizes its approach and findings. "
    "Introduction: The research gap is presented. Methods: We collected data and analysed it "
    "using a defined procedure. Results: The results show a pattern. Discussion: Findings are "
    "compared with prior work. Conclusion: We summarize implications. References: Smith (2024). "
    "Limitations: The sample is small. Data availability: Data available on request."
)

def test_create_and_retrieve_review(client: TestClient) -> None:
    created = client.post(
        "/api/v1/reviews",
        data={"text": MANUSCRIPT, "journal": "Example Journal", "reviewers": "2",
              "strictness": "standard", "panel": "general"},
    )
    assert created.status_code == 200
    review_id = created.json()["id"]

    result = client.get(f"/api/v1/reviews/{review_id}")
    assert result.status_code == 200
    body = result.json()
    assert body["status"] == "done"
    assert body["simulated"] is True
    assert len(body["reviewers"]) == 2
    assert body["decision"] in {"accept", "minor_revision", "major_revision", "reject"}


def test_reject_too_short_manuscript(client: TestClient) -> None:
    response = client.post(
        "/api/v1/reviews",
        data={"text": "Too short", "reviewers": "1", "strictness": "standard", "panel": "general"},
    )
    assert response.status_code == 400
    assert "100 characters" in response.json()["error"]["message"]

def test_unknown_review_id_returns_404(client: TestClient) -> None:
    response = client.get("/api/v1/reviews/not-a-real-id")
    assert response.status_code == 404
