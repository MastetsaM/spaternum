# Built on the machine that runs it (ops/install.sh, ops/update.sh) — no registry.
FROM python:3.14-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.4 /uv /usr/local/bin/uv

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PATH="/app/.venv/bin:$PATH"

# Dependencies first, so code changes don't reinstall them
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY spaternum ./spaternum

EXPOSE 8000
# --proxy-headers: requests arrive through tailscale serve
CMD ["uvicorn", "spaternum.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
