# Container Guide for Geoclaw

## Overview
Geoclaw supports optional container runtime for enhanced security and isolation. Choose between:
- **CLI Mode** (default): Lowest footprint, direct execution
- **Docker**: Cross-platform containerization
- **Apple Container**: macOS-native lightweight containers

## When to Use Containers

### Use CLI Mode When:
- Running on resource-constrained hardware (Raspberry Pi)
- Need fastest startup time
- Trust the environment and applications
- Simplicity is priority

### Use Docker When:
- Need strong isolation between agents
- Running untrusted or third-party skills
- Deploying to mixed environments (dev/staging/prod)
- Want reproducible builds

### Use Apple Container When:
- On macOS and want native performance
- Need lighter weight than Docker
- Want macOS-specific features (Keychain integration)

## Docker Setup

### Installation
```bash
# macOS
brew install --cask docker

# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in

# Verify
docker --version
docker info
```

### Configuration
Set in `.env`:
```bash
GEOCLAW_RUNTIME_MODE=docker
GEOCLAW_DOCKER_IMAGE=geoclaw-agent:latest
GEOCLAW_CONTAINER_MEMORY_LIMIT=512m
GEOCLAW_CONTAINER_CPU_LIMIT=1.0
```

### Building Image
Geoclaw auto-builds Docker image on first run. Manual build:
```bash
cd /path/to/geoclaw
./scripts/run-container.sh
```

### Custom Dockerfile
Create `Dockerfile.custom` for customizations:
```dockerfile
FROM node:22-alpine

# Install additional dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl \
    ffmpeg \
    tesseract-ocr \
    tesseract-ocr-data-eng

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Expose ports
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
```

## Apple Container Setup

### Installation
```bash
# macOS only
brew install container

# Verify
container --version
```

### Configuration
Set in `.env`:
```bash
GEOCLAW_RUNTIME_MODE=apple-container
```

### Container Configuration
Geoclaw auto-generates `container.yaml`. Customize:
```yaml
version: "1.0"
image:
  from: node:22-alpine
  entrypoint: ["node", "dist/index.js"]
  env:
    NODE_ENV: production
    TZ: UTC
mounts:
  - type: bind
    source: ./workspace
    target: /app/workspace
    readOnly: false
  - type: bind
    source: ./data
    target: /app/data
    readOnly: false
  - type: bind
    source: ./logs
    target: /app/logs
    readOnly: false
resources:
  memory: 512Mi
  cpu: 1
network:
  host: true
security:
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
```

## Security Features

### OneCLI Agent Vault
Inject credentials at runtime, not in containers:
```bash
# Install OneCLI
curl -fsSL onecli.sh/install | sh

# Configure in .env
GEOCLAW_ONECLI_ENABLED=true
```

### Mount Allowlists
Control filesystem access:
```yaml
security:
  mountAllowlist:
    - ./workspace  # Read/write
    - ./data       # Read/write  
    - /tmp:ro      # Read-only
    - /dev/null    # Specific device
```

### Resource Limits
Prevent resource exhaustion:
```bash
# Docker
GEOCLAW_CONTAINER_MEMORY_LIMIT=512m
GEOCLAW_CONTAINER_CPU_LIMIT=1.0

# Apple Container
resources:
  memory: 512Mi
  cpu: 1
```

## Networking

### Port Mapping
```bash
# Docker port mapping
docker run -p 3000:3000 geoclaw-agent

# In geoclaw.config.yml
runtime:
  ports:
    - "3000:3000"
```

### Network Modes
```bash
# Host network (shared with host)
docker run --network host geoclaw-agent

# Bridge network (isolated)
docker run --network bridge geoclaw-agent

# Custom network
docker network create geoclaw-net
docker run --network geoclaw-net geoclaw-agent
```

## Storage

### Volumes for Persistence
```bash
# Named volume
docker volume create geoclaw-data
docker run -v geoclaw-data:/app/data geoclaw-agent

# Bind mount (development)
docker run -v $(pwd)/data:/app/data geoclaw-agent
```

### Backup Strategy
```bash
# Backup Docker volume
docker run --rm -v geoclaw-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/geoclaw-data-$(date +%Y%m%d).tar.gz -C /data .

# Restore
docker run --rm -v geoclaw-data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/geoclaw-data-20240101.tar.gz -C /data
```

## Monitoring & Logs

### Container Logs
```bash
# Docker logs
docker logs geoclaw-agent
docker logs -f geoclaw-agent  # Follow
docker logs --tail 100 geoclaw-agent  # Last 100 lines

# Apple Container logs
container logs geoclaw-agent
```

### Resource Monitoring
```bash
# Docker stats
docker stats geoclaw-agent

# Process inspection
docker top geoclaw-agent
docker inspect geoclaw-agent
```

### Health Checks
```bash
# Docker health status
docker ps --filter "name=geoclaw-agent" --format "table {{.Names}}\t{{.Status}}"

# Custom health endpoint
curl http://localhost:3000/health
```

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker logs geoclaw-agent 2>&1 | tail -50

# Check image exists
docker image ls | grep geoclaw-agent

# Check port conflicts
lsof -i :3000

# Run with interactive shell for debugging
docker run -it --rm geoclaw-agent sh
```

### Permission Issues
```bash
# Fix volume permissions
docker run --rm -v $(pwd)/data:/data alpine chown -R 1001:1001 /data

# Check container user
docker exec geoclaw-agent id
```

### Network Issues
```bash
# Test container networking
docker exec geoclaw-agent curl -I https://api.openai.com

# Check DNS
docker exec geoclaw-agent cat /etc/resolv.conf

# Test port mapping
curl http://localhost:3000/health
```

### Resource Issues
```bash
# Check memory usage
docker stats --no-stream geoclaw-agent

# Increase limits
GEOCLAW_CONTAINER_MEMORY_LIMIT=1g
GEOCLAW_CONTAINER_CPU_LIMIT=2.0
```

## Performance Optimization

### Image Size
```dockerfile
# Use multi-stage builds
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production
USER node
CMD ["node", "dist/index.js"]
```

### Startup Time
```bash
# Keep container running
docker run -d --restart unless-stopped geoclaw-agent

# Use health checks for auto-recovery
HEALTHCHECK --interval=30s --timeout=3s geoclaw-agent
```

### Memory Usage
```bash
# Limit heap size
NODE_OPTIONS="--max-old-space-size=384"

# Use Alpine base image
FROM node:22-alpine
```

## Production Deployment

### Docker Compose
Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  geoclaw:
    build: .
    image: geoclaw-agent:latest
    container_name: geoclaw-agent
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./workspace:/app/workspace
      - ./data:/app/data
      - ./logs:/app/logs
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '1.0'
```

### Kubernetes
Create `geoclaw-deployment.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: geoclaw-agent
spec:
  replicas: 1
  selector:
    matchLabels:
      app: geoclaw-agent
  template:
    metadata:
      labels:
        app: geoclaw-agent
    spec:
      containers:
      - name: geoclaw-agent
        image: geoclaw-agent:latest
        ports:
        - containerPort: 3000
        volumeMounts:
        - name: workspace
          mountPath: /app/workspace
        - name: data
          mountPath: /app/data
        envFrom:
        - secretRef:
            name: geoclaw-secrets
        resources:
          limits:
            memory: "512Mi"
            cpu: "1"
      volumes:
      - name: workspace
        hostPath:
          path: /path/to/workspace
      - name: data
        hostPath:
          path: /path/to/data
```

## Migration Between Runtimes

### CLI → Docker
1. Backup data
2. Set `GEOCLAW_RUNTIME_MODE=docker`
3. Run `./scripts/run.sh`
4. Test functionality
5. Update startup scripts

### Docker → Apple Container
1. Stop Docker container
2. Set `GEOCLAW_RUNTIME_MODE=apple-container`
3. Run `./scripts/run.sh`
4. Verify macOS compatibility

### Any → CLI
1. Stop container
2. Set `GEOCLAW_RUNTIME_MODE=cli`
3. Run `./scripts/run.sh`
4. Monitor resource usage

## Best Practices

### Security
1. Use non-root users in containers
2. Enable read-only root filesystem when possible
3. Regularly update base images
4. Scan images for vulnerabilities
5. Use secrets management (OneCLI)

### Performance
1. Use .dockerignore to exclude unnecessary files
2. Implement health checks
3. Set appropriate resource limits
4. Use connection pooling
5. Monitor and optimize

### Operations
1. Implement logging aggregation
2. Set up monitoring and alerts
3. Create backup procedures
4. Document container configurations
5. Test disaster recovery

## Resources
- [Docker Documentation](https://docs.docker.com/)
- [Apple Container GitHub](https://github.com/apple/container)
- [OneCLI Agent Vault](https://github.com/onecli/onecli)
- [Docker Security Best Practices](https://docs.docker.com/develop/security-best-practices/)
- [Container Networking](https://docs.docker.com/network/)
