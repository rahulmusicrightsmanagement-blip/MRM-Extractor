FROM python:3.12-slim

WORKDIR /app

# System deps kept minimal; wheels cover pymongo/bcrypt/google libs.
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Coolify provides PORT; default 8000 for local docker run.
ENV HOST=0.0.0.0 \
    PORT=8000

EXPOSE 8000

CMD ["sh", "-c", "uvicorn backend:app --host ${HOST:-0.0.0.0} --port ${PORT:-8000}"]
