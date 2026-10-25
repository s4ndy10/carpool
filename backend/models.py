import re
from decimal import Decimal
from typing import Annotated, Literal

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator, model_validator

Category = Literal["Sedan", "SUV", "Coupe", "Hatchback", "Truck", "Wagon", "Convertible"]
Quantity = Annotated[int, Field(strict=True, ge=0, le=1_000_000)]


def parse_price(value):
    if type(value) not in (int, float):
        raise ValueError("Price must be a number.")
    amount = Decimal(str(value))
    if (
        not amount.is_finite()
        or not 0 <= amount <= 100_000_000
        or amount * 100 != (amount * 100).to_integral_value()
    ):
        raise ValueError("Price must be between 0 and 100,000,000 with at most two decimal places.")
    return float(amount)


Price = Annotated[float, BeforeValidator(parse_price)]


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Login(InputModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=72)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        if not isinstance(value, str):
            raise ValueError("Email must be a string.")
        value = value.strip().lower()
        try:
            # Syntax validation only: registration must not depend on DNS availability.
            validate_email(value, check_deliverability=False, test_environment=True)
        except EmailNotValidError as exc:
            raise ValueError("Enter a valid email address.") from exc
        return value

    @field_validator("password")
    @classmethod
    def bcrypt_safe_password(cls, value):
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must not exceed 72 UTF-8 bytes.")
        return value


class Registration(Login):
    name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=12, max_length=72)

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value):
        return value.strip() if isinstance(value, str) else value


class VehicleInput(InputModel):
    make: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=100)
    category: Category
    price: Price
    quantity: Quantity

    @field_validator("make", "model", mode="before")
    @classmethod
    def trim_details(cls, value):
        return value.strip() if isinstance(value, str) else value


class VehicleUpdate(VehicleInput):
    expectedQuantity: Quantity | None = None

    @field_validator("expectedQuantity", mode="before")
    @classmethod
    def reject_null_expectation(cls, value):
        if value is None:
            raise ValueError("Expected quantity must be an integer.")
        return value


class Purchase(InputModel):
    quantity: Annotated[int, Field(strict=True, ge=1, le=1_000_000)] = 1


class Restock(InputModel):
    quantity: Annotated[int, Field(strict=True, ge=1, le=1_000_000)]


class Search(InputModel):
    q: str | None = Field(default=None, max_length=180)
    make: str | None = Field(default=None, max_length=80)
    model: str | None = Field(default=None, max_length=100)
    category: Category | None = None
    minPrice: Decimal | None = None
    maxPrice: Decimal | None = None

    @field_validator("q", "make", "model", mode="before")
    @classmethod
    def trim_query(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("minPrice", "maxPrice", mode="before")
    @classmethod
    def query_price(cls, value):
        if value is None:
            return value
        if not isinstance(value, str) or not re.fullmatch(r"[0-9]+(?:\.[0-9]{1,2})?", value):
            raise ValueError("Enter a non-negative price with at most two decimal places.")
        amount = Decimal(value)
        if amount > 100_000_000:
            raise ValueError("Price cannot exceed 100,000,000.")
        return amount

    @model_validator(mode="after")
    def ordered_prices(self):
        if (
            self.minPrice is not None
            and self.maxPrice is not None
            and self.minPrice > self.maxPrice
        ):
            raise ValueError("Minimum price must not exceed maximum price.")
        return self


class User(BaseModel):
    id: str
    name: str
    email: str
    role: Literal["user", "admin"]


class Session(BaseModel):
    token: str
    user: User


class CurrentUserResponse(BaseModel):
    user: User


class Vehicle(BaseModel):
    id: str
    make: str
    model: str
    category: Category
    price: float
    quantity: int


class VehicleResponse(BaseModel):
    vehicle: Vehicle


class VehicleList(BaseModel):
    vehicles: list[Vehicle]
