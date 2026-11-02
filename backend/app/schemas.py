from typing import Literal
from pydantic import BaseModel, Field


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")
    display_name: str = Field(min_length=1, max_length=48)
    password: str = Field(min_length=8, max_length=72)


class LoginIn(BaseModel):
    username: str
    password: str


class ProfileIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=48)
    bio: str = Field(default="", max_length=200)


class ConversationIn(BaseModel):
    kind: Literal["direct", "group"]
    title: str | None = Field(default=None, max_length=64)
    member_ids: list[str] = Field(min_length=1, max_length=100)


class SendIn(BaseModel):
    """Inbound WebSocket frame: message.send"""
    type: Literal["message.send"]
    request_id: str = Field(max_length=64)
    conversation_id: str = Field(max_length=64)
    text: str = Field(min_length=1)


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
