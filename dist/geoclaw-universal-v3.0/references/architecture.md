# Geoclaw Micro-Agent Architecture v2.0

## Goals
- **Low footprint:** Target sub-200 MB RAM usage and <30s cold start by trimming background services and running only the CLI runtime.
- **Easy installs:** Single bootstrap script + `.env` template + `openclaw agent init`. Users only supply API keys and channel tokens.
- **Multi-channel chat:** Telegram + WhatsApp + Slack + Signal support so users can talk to the agent where they're comfortable.
- **Model flexibility:** Allow swapping between lightweight (gpt-4o-mini, claude-haiku, gemini-flash, deepseek-chat) and heavier models, but default to efficient ones.
- **Security isolation:** Optional container runtime (Docker/Apple Container) with credential vault (OneCLI) and explicit mount allowlists.

## Components

### 1. Core Runtime
- **CLI Mode:** `openclaw agent run --cli` (default, lowest footprint)
- **Container Mode:** Optional Docker/Apple Container isolation
- **Hybrid Mode:** CLI with selective containerization for sensitive tasks

### 2. Messaging Connectors
- **Telegram:** Bot API via BotFather token
- **WhatsApp:** Cloud API via Meta developer token + phone number ID
- **Slack:** Socket Mode (no public URL needed) via Bot + App tokens
- **Signal:** signal-cli integration with pairing security

### 3. Enterprise Integrations
- **Monday.com:** Project management API with GraphQL, board operations, webhooks
- **Salesforce:** CRM REST API with OAuth, SOQL queries, object operations, Chatter

### 4. Security Layer
- **OneCLI Agent Vault:** Runtime credential injection (no secrets in containers)
- **Mount Allowlists:** Explicit filesystem access control
- **Sender Allowlists:** Per-channel access control (pairing for Signal, allowlists for others)
- **Container Isolation:** Optional Docker/Apple Container sandboxing
- **API Security:** OAuth 2.0 for enterprise integrations, token rotation

### 5. Skill System
- **Pre-selected skills:** gemini, weather, nano-pdf, openai-whisper (lightweight)
- **Enterprise skills:** monday, salesforce (business automation)
- **Skill marketplace:** Add skills via `openclaw skills install <skill>.skill`
- **Custom skills:** User-defined skills for specific workflows

### 6. Configuration Management
- **Environment-based:** `.env` carries all secrets (GEOCLAW_* variables)
- **Template-driven:** `.env.template` with documentation
- **Git-friendly:** Config files exclude secrets, can be versioned
- **Integration configs:** Separate configs for Monday.com boards, Salesforce objects

## Deployment Patterns

### Pattern 1: CLI-Only (Default)
```
┌────────────┐     ┌──────────────┐     ┌───────────┐
│ Telegram   │ --> │              │     │           │
├────────────┤     │  Geoclaw CLI │ --> │ Model API │
│ WhatsApp   │ --> │  (OpenClaw)  │     │           │
├────────────┤     │              │     └───────────┘
│ Slack      │ --> │              │
├────────────┤     └──────────────┘
│ Signal     │ ───────────────────┘
└────────────┘
```
- Single process, minimal memory
- Direct channel integrations
- Fast startup (<5s)

### Pattern 2: Containerized
```
┌────────────┐     ┌──────────────┐     ┌──────────────┐     ┌───────────┐
│ Channels   │ --> │ Geoclaw Host │ --> │  Container   │ --> │ Model API │
└────────────┘     │  (Orchestr)  │     │  (Agent)     │     └───────────┘
                   └──────────────┘     └──────────────┘
                          │                     │
                          │                     │
                    ┌─────▼─────┐         ┌─────▼─────┐
                    │ OneCLI    │         │ Mounted   │
                    │  Vault    │         │ Workspace │
                    └───────────┘         └───────────┘
```
- Agent runs in isolated container
- Credentials injected via OneCLI
- Filesystem access controlled via mount allowlists
- Higher security, slightly more overhead

### Pattern 3: Hybrid
- CLI mode for most operations
- Container mode for specific skills/tasks
- Dynamic runtime selection based on task sensitivity

## Integration Comparison

### Messaging Channels
| Channel | Setup Complexity | Security | Features | Best For |
|---------|-----------------|----------|----------|----------|
| **Telegram** | Low (BotFather) | Medium (public bots) | Groups, media, buttons | Public communities |
| **WhatsApp** | Medium (Meta Dev) | High (E2E) | Business API, templates | Customer support |
| **Slack** | Medium (OAuth) | High (workspace) | Threads, rich formatting | Team collaboration |
| **Signal** | High (signal-cli) | Very High (E2E+pairing) | Privacy-focused | Sensitive communications |

### Enterprise Integrations
| Integration | Setup Complexity | API Type | Key Features | Business Use |
|-------------|-----------------|----------|--------------|--------------|
| **Monday.com** | Medium (API token) | GraphQL | Boards, items, updates, webhooks | Project management, task tracking |
| **Salesforce** | High (OAuth/Connected App) | REST/SOQL | CRM objects, reports, Chatter, workflows | Sales automation, customer support, analytics |

## Resource Requirements

### Minimum (CLI Mode)
- **RAM:** 100-200 MB
- **CPU:** 1 core
- **Storage:** 500 MB
- **Network:** Outbound HTTPS

### Recommended (Container Mode)
- **RAM:** 256-512 MB
- **CPU:** 2 cores
- **Storage:** 1 GB
- **Network:** Outbound HTTPS + container networking

### Raspberry Pi 4 (Example)
- **Model:** 4B 4GB
- **OS:** Raspberry Pi OS Lite
- **Runtime:** CLI mode recommended
- **Channels:** 2-3 simultaneous
- **Performance:** Good for small teams

## Security Model

### Defense in Depth
1. **Network:** Firewall, VPN, private networks
2. **Host:** OS hardening, minimal services
3. **Container:** Isolation, read-only rootfs
4. **Application:** Input validation, rate limiting
5. **Credentials:** Runtime injection, short-lived tokens

### Access Control
- **Telegram:** Bot token + optional webhook IP whitelist
- **WhatsApp:** Cloud token + webhook verification
- **Slack:** OAuth tokens + Socket Mode
- **Signal:** Pairing codes + allowlists

### Data Protection
- **Secrets:** Never in containers, OneCLI vault
- **Messages:** Encrypted in transit (channel-dependent)
- **Storage:** SQLite with optional encryption
- **Logs:** No secrets, structured logging

## Scaling Considerations

### Vertical Scaling (Single Instance)
- Add more channels
- Increase container resources
- Enable more skills
- **Limit:** ~5 channels, 10 concurrent users

### Horizontal Scaling (Multiple Instances)
- Separate instances per team/department
- Load balancer for webhooks
- Shared database (PostgreSQL instead of SQLite)
- **Use when:** >50 users, multiple organizations

### Federation (Future)
- Multiple Geoclaw instances can communicate
- Cross-instance skill sharing
- Unified management dashboard
- **Research phase**

## Integration Points

### External APIs
- **AI Models:** OpenAI, Anthropic, Google, DeepSeek, local LLMs
- **Storage:** S3-compatible, Google Drive, local filesystem
- **Databases:** SQLite (default), PostgreSQL, MySQL
- **Monitoring:** Prometheus, Grafana, health checks

### Development Workflow
1. Local development with CLI mode
2. Staging with container mode
3. Production with full security
4. CI/CD with skill testing

## Monitoring & Observability

### Health Checks
- `./scripts/run.sh --health` - Basic health check
- Channel connectivity tests
- Model API availability
- Disk space, memory usage

### Logging
- Structured JSON logs
- Channel-specific log levels
- Rotation and compression
- External log aggregation (optional)

### Metrics
- Message throughput
- Response latency
- Error rates
- Resource utilization

## Upgrade Path

### v1.0 → v2.0
1. Backup `.env` and database
2. Run enhanced init script with `--upgrade`
3. Test new channels incrementally
4. Enable container mode (optional)

### Future Versions
- Skill marketplace integration
- Advanced container orchestration
- Cross-channel conversations
- Plugin system for custom runtimes

## Best Practices

### Deployment
1. Use dedicated bot numbers/accounts
2. Implement backup strategy
3. Monitor resource usage
4. Regular security updates

### Configuration
1. Version control config files (without secrets)
2. Use environment-specific `.env` files
3. Document customizations
4. Test config changes in staging

### Operations
1. Regular health checks
2. Log monitoring
3. User feedback collection
4. Performance optimization

## Troubleshooting Framework

### Level 1: Basic Checks
- Service running? `ps aux | grep openclaw`
- Logs clean? `tail -f geoclaw.log`
- Network connectivity? `curl https://api.openai.com`

### Level 2: Channel-Specific
- Tokens valid? (channel test commands)
- Webhooks configured? (WhatsApp/Slack)
- Pairing approved? (Signal)

### Level 3: Deep Diagnostics
- Database integrity: `sqlite3 messages.db "PRAGMA integrity_check;"`
- Memory profiling: `./scripts/run.sh --profile`
- Network tracing: `tcpdump` or Wireshark

## Community & Support
- GitHub repository for issues
- Documentation site
- Example deployments
- Skill sharing platform

This architecture enables Geoclaw to be both simple enough for individual users and scalable enough for small organizations, while maintaining security and flexibility.
