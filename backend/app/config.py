from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    ENVIRONMENT: str = "development"
    SERVER_ID: str = "node-1"
    HOST: str = "0.0.0.0"
    PORT: int = 8001
    REDIS_URL: str = "redis://localhost:6379/0"
    FRONTEND_ORIGINS: str = "http://localhost:5173"
    APP_SECRET_KEY: str = "dev-secret-change-me"
    DATABASE_PATH: str = "./vakochat.db"  # BOTH nodes must point at the same file
    TOKEN_TTL_MINUTES: int = 720
    MAX_MESSAGE_CHARS: int = 4000
    HEARTBEAT_TTL_S: int = 6
    HEARTBEAT_EVERY_S: int = 2
    NODE_IDS: str = "node-1,node-2"  # expected cluster members (monitoring)
    ADMIN_USERNAMES: str = ""

    @model_validator(mode="after")
    def validate_production_settings(self):
        if self.ENVIRONMENT.lower() != "production":
            return self
        if len(self.APP_SECRET_KEY) < 32 or self.APP_SECRET_KEY == "dev-secret-change-me":
            raise ValueError("APP_SECRET_KEY must be a unique secret of at least 32 characters in production")
        origins = self.origins
        if not origins or any(not origin.startswith("https://") for origin in origins):
            raise ValueError("FRONTEND_ORIGINS must contain only HTTPS origins in production")
        if not any(name.strip() for name in self.ADMIN_USERNAMES.split(",")):
            raise ValueError("Set at least one bootstrap administrator in ADMIN_USERNAMES for production")
        return self

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.FRONTEND_ORIGINS.split(",") if o.strip()]


settings = Settings()
