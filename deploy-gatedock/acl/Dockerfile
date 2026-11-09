# syntax=docker/dockerfile:1
FROM python:3.8.20-slim-bookworm AS wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libldap2-dev libsasl2-dev libffi-dev \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY requirements.lock ./
# Old Celery-era metadata requires pip before its strict metadata validation.
RUN pip install --no-cache-dir pip==24.0 setuptools==57.5.0 wheel==0.37.0 \
    && pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.lock

FROM python:3.8.20-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates tzdata libldap-2.5-0 libsasl2-2 libmagic1 patch wget \
    && rm -rf /var/lib/apt/lists/*
ENV TZ=Asia/Shanghai \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /data/apps/acl
COPY requirements.lock /tmp/requirements.lock
COPY --from=wheels /wheels /wheels
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r /tmp/requirements.lock \
    && pip check && rm -rf /wheels
COPY --from=acl-source acl-api/api ./api
COPY --from=acl-source acl-api/autoapp.py acl-api/celery_worker.py ./
COPY --from=acl-source acl-api/settings.example.py ./settings_base.py
COPY --from=acl-source LICENSE ./LICENSE
COPY settings.py ./settings.py
COPY logout-session.patch /tmp/logout-session.patch
RUN patch --batch --fuzz=0 -p1 < /tmp/logout-session.patch \
    && python -m compileall -q api settings.py \
    && mkdir -p logs \
    && rm /tmp/logout-session.patch
ARG ACL_REVISION
LABEL org.opencontainers.image.source="https://github.com/rayniel/gatedock-acl" \
    org.opencontainers.image.revision="${ACL_REVISION}" \
    org.opencontainers.image.title="GateDock ACL"
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "autoapp:app"]
