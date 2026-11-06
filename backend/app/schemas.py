from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RegisterIn(InputModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")
    display_name: str = Field(min_length=1, max_length=48)
    password: str = Field(min_length=8, max_length=72)
    email: str | None = Field(default=None, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    phone: str | None = Field(default=None, max_length=32, pattern=r"^\+?[0-9()\-\s]{7,24}$")

    @field_validator("username", "display_name", mode="before")
    @classmethod
    def trim_registration_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("email", "phone", mode="before")
    @classmethod
    def empty_registration_contact_to_none(cls, value):
        if isinstance(value, str):
            return value.strip() or None
        return value


class LoginIn(InputModel):
    username: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=72)

    @field_validator("username")
    @classmethod
    def trim_username(cls, value: str) -> str:
        return value.strip()


class ContactMatchIn(InputModel):
    emails: list[Annotated[str, Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]] = Field(default_factory=list, max_length=100)
    phones: list[Annotated[str, Field(max_length=32, pattern=r"^\+?[0-9()\-\s]{7,24}$")]] = Field(default_factory=list, max_length=100)


class ProfileIn(InputModel):
    display_name: str = Field(min_length=1, max_length=48)
    bio: str = Field(default="", max_length=200)
    email: str | None = Field(default=None, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    phone: str | None = Field(default=None, max_length=32, pattern=r"^\+?[0-9()\-\s]{7,24}$")

    @field_validator("display_name", "bio", mode="before")
    @classmethod
    def trim_profile_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("email", "phone", mode="before")
    @classmethod
    def empty_profile_contact_to_none(cls, value):
        if isinstance(value, str):
            return value.strip() or None
        return value


class StoryIn(InputModel):
    text: str = Field(default="", max_length=500)
    image_data: str | None = Field(default=None, max_length=2_800_000)
    image_content_type: Literal["image/png", "image/jpeg", "image/webp"] | None = None
    audience: Literal["all", "messages", "followers", "both"] = "all"

    @model_validator(mode="after")
    def require_content(self):
        if not self.text.strip() and not self.image_data:
            raise ValueError("A story must include text or an image")
        if bool(self.image_data) != bool(self.image_content_type):
            raise ValueError("Story image data and content type must be supplied together")
        return self


class StoryReactionIn(InputModel):
    reaction: Literal["❤️", "😂", "😮", "😢", "👏", "🔥"]


class VerificationApplicationIn(InputModel):
    reason: str = Field(min_length=20, max_length=500)

    @model_validator(mode="after")
    def normalize_reason(self):
        self.reason = self.reason.strip()
        if len(self.reason) < 20:
            raise ValueError("Verification reason must be at least 20 characters")
        return self


class VerificationReviewIn(InputModel):
    approved: bool


class EditMessageIn(InputModel):
    text: str = Field(min_length=1, max_length=4000)


class ConversationIn(InputModel):
    kind: Literal["direct", "group"]
    title: str | None = Field(default=None, max_length=64)
    description: str = Field(default="", max_length=500)
    member_ids: list[str] = Field(min_length=1, max_length=100)

    @field_validator("title", mode="before")
    @classmethod
    def trim_conversation_title(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("description", mode="before")
    @classmethod
    def trim_conversation_description(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("member_ids")
    @classmethod
    def require_unique_members(cls, value: list[str]) -> list[str]:
        value = [member.strip() for member in value]
        if any(not member for member in value):
            raise ValueError("Member IDs cannot be empty")
        if len(set(value)) != len(value):
            raise ValueError("Member IDs must be unique")
        return value

    @model_validator(mode="after")
    def require_group_title(self):
        if self.kind == "group" and not self.title:
            raise ValueError("Group title required")
        return self


class ConversationUpdateIn(InputModel):
    title: str = Field(min_length=1, max_length=64)
    description: str = Field(default="", max_length=500)

    @field_validator("title", "description", mode="before")
    @classmethod
    def trim_update_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class GroupInviteIn(InputModel):
    user_id: str = Field(min_length=1, max_length=64)


class BulkDeleteMessagesIn(InputModel):
    message_ids: list[Annotated[str, Field(min_length=1, max_length=64)]] = Field(min_length=1, max_length=100)

    @field_validator("message_ids")
    @classmethod
    def require_unique_message_ids(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("Message IDs must be unique")
        return value


class SendIn(BaseModel):
    """Inbound WebSocket frame: message.send"""
    type: Literal["message.send"]
    request_id: str = Field(default="", max_length=64)
    conversation_id: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1, max_length=4000)


class TypingIn(BaseModel):
    """Inbound WebSocket frame: typing.start / typing.stop (legacy typing also accepted)."""
    type: Literal["typing", "typing.start", "typing.stop"]
    conversation_id: str = Field(min_length=1, max_length=64)
    is_typing: bool | None = None


class EventEnvelope(BaseModel):
    """Inter-node event published on Redis (versioned)."""
    event_id: str
    event_type: Literal["chat.message.created"]
    schema_version: Literal[1] = 1
    origin_node: str
    message_id: str
    conversation_id: str
    sender_id: str
    sender_name: str
    recipient_ids: list[str]
    created_at: str
    payload: dict


class TypingPayload(BaseModel):
    is_typing: bool


class TypingEnvelope(BaseModel):
    """Transient inter-node typing event published on Redis (versioned)."""
    event_id: str
    event_type: Literal["chat.typing"]
    schema_version: Literal[1] = 1
    origin_node: str
    conversation_id: str
    sender_id: str
    sender_name: str
    recipient_ids: list[str]
    created_at: str
    payload: TypingPayload


class ReceiptEnvelope(BaseModel):
    event_id: str
    event_type: Literal["chat.message.receipt"]
    schema_version: Literal[1] = 1
    origin_node: str
    message_id: str
    conversation_id: str
    sender_id: str
    recipient_ids: list[str]
    status: Literal["delivered", "read"]
    delivered_nodes: str | None = None
    created_at: str


class DeleteEnvelope(BaseModel):
    event_id: str
    event_type: Literal["chat.message.deleted"]
    schema_version: Literal[1] = 1
    origin_node: str
    message_id: str
    conversation_id: str
    recipient_ids: list[str]


class EditEnvelope(BaseModel):
    event_id: str
    event_type: Literal["chat.message.edited"]
    schema_version: Literal[1] = 1
    origin_node: str
    message_id: str
    conversation_id: str
    recipient_ids: list[str]
    text: str
    edited_at: str
