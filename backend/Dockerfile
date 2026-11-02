FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && addgroup --system --gid 10001 vakochat \
    && adduser --system --uid 10001 --ingroup vakochat --home /srv vakochat \
    && mkdir -p /data \
    && chown vakochat:vakochat /data
COPY app app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER 10001:10001
CMD ["sh","-c","exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8001}"]
