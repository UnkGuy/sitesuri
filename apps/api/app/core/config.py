from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    clerk_issuer: str
    clerk_secret_key: str

    cors_origins: str = (
        "http://localhost:3000,"
        "http://127.0.0.1:3000,"
        "https://sitesuri.vercel.app"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    @property
    def allowed_origins(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]


settings = Settings()