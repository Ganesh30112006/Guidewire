import pytest
from pydantic import ValidationError

from app.schemas.schemas import PlanCreateRequest, RegisterRequest, UpdateProfileRequest


def test_register_request_trims_and_validates_fields():
    payload = RegisterRequest(
        name="  Rahul Kumar  ",
        email="rahul@example.com",
        phone="+919876543210",
        city="  Mumbai ",
        platform=" Zomato ",
        avg_daily_income=900,
        password="Strong1!",
    )

    assert payload.name == "Rahul Kumar"
    assert payload.city == "Mumbai"
    assert payload.platform == "Zomato"


def test_update_profile_request_trims_optional_fields():
    payload = UpdateProfileRequest(name="  Test User  ", city="  Pune  ", platform="  Other  ")

    assert payload.name == "Test User"
    assert payload.city == "Pune"
    assert payload.platform == "Other"


def test_plan_create_request_trims_name():
    payload = PlanCreateRequest(
        name="  Premium Plan  ",
        weekly_premium=99,
        coverage=25000,
        risks=["Rain", "Flood"],
    )

    assert payload.name == "Premium Plan"


def test_register_rejects_invalid_platform():
    with pytest.raises(ValidationError):
        RegisterRequest(
            name="Rahul Kumar",
            email="rahul@example.com",
            phone="+919876543210",
            city="Mumbai",
            platform="Unknown",
            avg_daily_income=900,
            password="Strong1!",
        )
