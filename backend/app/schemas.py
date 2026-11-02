from typing import Annotated, Literal
from pydantic import BaseModel, Field


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")
    display_name: str = Field(min_length=1, max_length=48)
    password: str = Field(min_length=8, max_length=72)
    email: str | None = Field(default=None, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    phone: str | None = Field(default=None, max_length=32, pattern=r"^\+?[0-9()\-\s]{7,24}$")


class LoginIn(BaseModel):
    username: str
    password: str


class ContactMatchIn(BaseModel):
    emails: list[Annotated[str, Field(max_length=254)]] = Field(default_factory=list, max_length=100)
    phones: list[Annotated[str, Field(max_length=32)]] = Field(default_factory=list, max_length=100)


class ProfileIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=48)
    bio: str = Field(default="", max_length=200)
    email: str | None = Field(default=None, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    phone: str | None = Field(default=None, max_length=32)


class EditMessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class ConversationIn(BaseModel):
    kind: Literal["direct", "group"]
    title: str | None = Field(default=None, max_length=64)
    description: str = Field(default="", max_length=500)
    member_ids: list[str] = Field(min_length=1, max_length=100)


class ConversationUpdateIn(BaseModel):
    title: str = Field(min_length=1, max_length=64)
    description: str = Field(default="", max_length=500)


class SendIn(BaseModel):
    """Inbound WebSocket frame: message.send"""
    type: Literal["message.send"]
    request_id: str = Field(default="", max_length=64)
    conversation_id: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1)


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
