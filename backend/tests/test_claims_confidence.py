import pytest

from app.routers.claims import _resolve_zone_disruption_confidence


class _DBStub:
    def __init__(self, probability):
        self._probability = probability

    async def scalar(self, _stmt):
        return self._probability


@pytest.mark.asyncio
async def test_resolve_confidence_returns_neutral_without_zone():
    value = await _resolve_zone_disruption_confidence(
        db=_DBStub(90.0),
        zone=None,
        disruption_type="Heavy Rain",
    )
    assert value == 50.0


@pytest.mark.asyncio
async def test_resolve_confidence_returns_neutral_for_unmapped_disruption():
    value = await _resolve_zone_disruption_confidence(
        db=_DBStub(90.0),
        zone="Zone A",
        disruption_type="Other",
    )
    assert value == 50.0


@pytest.mark.asyncio
async def test_resolve_confidence_clamps_db_probability():
    high = await _resolve_zone_disruption_confidence(
        db=_DBStub(150.0),
        zone="Zone A",
        disruption_type="Flood",
    )
    low = await _resolve_zone_disruption_confidence(
        db=_DBStub(-10.0),
        zone="Zone A",
        disruption_type="Flood",
    )

    assert high == 100.0
    assert low == 0.0


@pytest.mark.asyncio
async def test_resolve_confidence_uses_db_probability_when_available():
    value = await _resolve_zone_disruption_confidence(
        db=_DBStub(72.34),
        zone="Zone B",
        disruption_type="Pollution",
    )
    assert value == 72.3
