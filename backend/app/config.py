from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
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

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.FRONTEND_ORIGINS.split(",") if o.strip()]


settings = Settings()
