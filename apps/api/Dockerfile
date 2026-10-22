
# SiteSuri FastAPI Backend
FROM python:3.13-slim

# Python runtime configuration
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Application directory
WORKDIR /app

# Install dependencies
COPY requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt

# Copy application source and Alembic configuration
COPY . .

# Run application as a non-root user
RUN useradd --create-home --uid 10001 appuser

USER appuser

# Default local port (Railway supplies PORT at runtime)
EXPOSE 8000

# Start FastAPI using Railway's assigned port
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
