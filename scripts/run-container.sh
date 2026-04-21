#!/usr/bin/env bash
# Geoclaw v3.0 - Container Runner
# Runs the agent inside Docker or Apple Container
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}▸ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error()   { echo -e "${RED}✗ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }

IMAGE_NAME="geoclaw-agent"
CONTAINER_NAME="geoclaw-runtime"

RUNTIME_MODE="${GEOCLAW_RUNTIME_MODE:-docker}"

case "$RUNTIME_MODE" in
  docker)
    print_status "Building Geoclaw Docker image..."

    # Create Dockerfile if it doesn't exist
    if [[ ! -f "$PROJECT_DIR/Dockerfile" ]]; then
      cat > "$PROJECT_DIR/Dockerfile" <<'DOCKERFILE'
FROM node:20-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    bash \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json ./

# Install npm dependencies
RUN npm install --omit=dev

# Copy application files
COPY geoclaw.mjs ./
COPY scripts/ ./scripts/
COPY references/ ./references/
COPY .env.template ./

# Make scripts executable
RUN find ./scripts -name "*.sh" -exec chmod +x {} \;
RUN chmod +x geoclaw.mjs

ENTRYPOINT ["node", "geoclaw.mjs"]
CMD ["start"]
DOCKERFILE
      print_success "Dockerfile created"
    fi

    # Build the image
    print_status "Building image: $IMAGE_NAME"
    docker build -t "$IMAGE_NAME" "$PROJECT_DIR"
    print_success "Image built"

    # Remove old container if it exists
    docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

    # Run the container
    print_status "Starting container: $CONTAINER_NAME"
    docker run \
      --name "$CONTAINER_NAME" \
      --rm \
      --env-file "$PROJECT_DIR/.env" \
      -v "$PROJECT_DIR/logs:/app/logs" \
      -p 18789:18789 \
      "$IMAGE_NAME" "$@"
    ;;

  apple-container)
    print_error "Apple Container support requires macOS. Use docker mode on Linux/WSL."
    exit 1
    ;;

  *)
    print_error "Unknown container runtime: $RUNTIME_MODE"
    echo "Valid container modes: docker, apple-container"
    exit 1
    ;;
esac
