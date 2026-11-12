FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM rust:1-slim-bookworm AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --no-create-home app
WORKDIR /srv
COPY --from=build /app/target/release/link-shortener /usr/local/bin/link-shortener
COPY --from=web /web/dist ./frontend/dist
COPY website/static ./website/static
USER app
# Return large allocations (Argon2 uses ~19 MiB per hash) to the OS instead of letting glibc retain them.
ENV BIND_ADDR=0.0.0.0:3000 MALLOC_MMAP_THRESHOLD_=1048576
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD curl -fs http://127.0.0.1:3000/ready || exit 1
CMD ["link-shortener"]
