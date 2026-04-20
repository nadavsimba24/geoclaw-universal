# Signal Setup Guide for Geoclaw

## Overview
Signal integration uses `signal-cli`, a command-line interface for Signal. Geoclaw communicates with `signal-cli` via its JSON-RPC daemon mode. Signal requires pairing for security, making it ideal for trusted communications.

## Prerequisites
- A phone number that can receive SMS (for registration)
- Or an existing Signal account (for QR linking)
- Java Runtime Environment (JRE) if using JVM build of signal-cli

## Installation Methods

### Option A: Native Build (Recommended for Linux)
```bash
# Get latest version
VERSION=$(curl -Ls -o /dev/null -w %{url_effective} https://github.com/AsamK/signal-cli/releases/latest | sed -e 's/^.*\/v//')

# Download and install
curl -L -O "https://github.com/AsamK/signal-cli/releases/download/v${VERSION}/signal-cli-${VERSION}-Linux-native.tar.gz"
sudo tar xf "signal-cli-${VERSION}-Linux-native.tar.gz" -C /opt
sudo ln -sf /opt/signal-cli-${VERSION}/bin/signal-cli /usr/local/bin/
signal-cli --version
```

### Option B: JVM Build (Cross-platform)
```bash
# Install Java if needed
sudo apt-get install default-jre  # Ubuntu/Debian
# or
brew install openjdk  # macOS

# Download and install
VERSION=$(curl -Ls -o /dev/null -w %{url_effective} https://github.com/AsamK/signal-cli/releases/latest | sed -e 's/^.*\/v//')
curl -L -O "https://github.com/AsamK/signal-cli/releases/download/v${VERSION}/signal-cli-${VERSION}.tar.gz"
sudo tar xf "signal-cli-${VERSION}.tar.gz" -C /opt
sudo ln -sf /opt/signal-cli-${VERSION}/bin/signal-cli /usr/local/bin/
signal-cli --version
```

### Option C: Package Manager
```bash
# macOS with Homebrew
brew install signal-cli

# Ubuntu/Debian with apt
sudo apt-get install signal-cli

# Arch Linux
sudo pacman -S signal-cli
```

## Setup Paths

### Path 1: QR Link (Use Existing Signal Account)
**Best if:** You want to use your personal Signal account or have an existing number.

1. Generate QR code:
   ```bash
   signal-cli link -n "Geoclaw"
   ```
2. Open Signal on your phone
3. Go to **Settings → Linked Devices → Link New Device**
4. Scan the QR code
5. The linked device appears as "Geoclaw"

**Advantages:**
- No SMS verification needed
- Uses existing Signal account
- Doesn't interfere with phone app

### Path 2: SMS Register (Dedicated Bot Number)
**Best if:** You want a separate bot number.

1. Get a dedicated phone number (Google Voice, VoIP.ms, etc.)
2. Register with signal-cli:
   ```bash
   signal-cli -a +15551234567 register
   ```
3. If captcha required:
   - Open `https://signalcaptchas.org/registration/generate.html`
   - Complete captcha, copy `signalcaptcha://...` link
   - Run: `signal-cli -a +15551234567 register --captcha 'signalcaptcha://...'`
4. Verify with SMS code:
   ```bash
   signal-cli -a +15551234567 verify <VERIFICATION_CODE>
   ```

**Important:** Registering a phone number with signal-cli can de-authenticate the Signal app on your phone for that number. Use a dedicated number.

## Environment Variables
Add to your `.env` file:
```bash
GEOCLAW_SIGNAL_ENABLED=true
GEOCLAW_SIGNAL_ACCOUNT=+15551234567
GEOCLAW_SIGNAL_CLI_PATH=signal-cli  # or full path if not in PATH
```

## Pairing (DM Access Control)

### How Pairing Works
1. Unknown sender sends message to bot
2. Bot ignores message, generates pairing code
3. Admin approves pairing code on server
4. Future messages from that sender are allowed

### Approve Pairing
When someone messages your bot for the first time:

1. Check pending pairings:
   ```bash
   openclaw pairing list signal
   ```
2. Approve pairing:
   ```bash
   openclaw pairing approve signal <PAIRING_CODE>
   ```
3. Verify approval:
   ```bash
   openclaw pairing list signal
   ```

### Allowlist Configuration
For automatic approval of specific numbers:
```yaml
channels:
  signal:
    dmPolicy: allowlist
    allowFrom:
      - +15557654321
      - +15558887766
```

## Group Chat Support

### Enable Groups
```yaml
channels:
  signal:
    groupPolicy: open  # or "allowlist" or "disabled"
    groupAllowFrom:
      - +15557654321
      - +15558887766
```

### Group ID Format
Signal group IDs are base64-encoded. To get group ID:
1. Add bot to group
2. Check logs when message is sent
3. Group ID appears in logs

## Running signal-cli Daemon

### Manual Daemon Start
```bash
signal-cli -a +15551234567 daemon --json-rpc
```

### Auto-start with Geoclaw
Geoclaw can auto-start the daemon. Ensure in config:
```yaml
channels:
  signal:
    autoStart: true
    startupTimeoutMs: 30000
```

## Testing

### 1. Start Geoclaw
```bash
./scripts/run.sh
```

### 2. Send Test Message
From your phone to the bot number:
- "Hello Geoclaw"
- Or any message

### 3. Approve Pairing (if first time)
```bash
openclaw pairing list signal
openclaw pairing approve signal <CODE>
```

### 4. Verify Response
Bot should respond within seconds.

## Troubleshooting

### Daemon not starting
1. Check signal-cli installation: `signal-cli --version`
2. Verify account is registered/linked: `signal-cli -a +15551234567 listAccounts`
3. Check Java installation (JVM build): `java --version`

### "Account not registered" error
1. Ensure account is properly registered/linked
2. Try re-linking: `signal-cli -a +15551234567 link -n "Geoclaw"`
3. Check account list: `signal-cli listAccounts`

### Messages not received
1. Verify daemon is running: `pgrep -af signal-cli`
2. Check pairing status: `openclaw pairing list signal`
3. Verify sender number is approved

### Captcha issues
1. Use same IP for browser and registration
2. Complete captcha quickly (tokens expire)
3. Try different browser/incognito mode
4. Wait a few minutes and retry

### Slow performance
JVM build has slower cold start. Solutions:
1. Use native build if available
2. Keep daemon running: `signal-cli -a +15551234567 daemon --json-rpc &`
3. Increase startup timeout in config

## Security Notes

### Data Storage
signal-cli stores data in:
- Linux: `~/.local/share/signal-cli/data/`
- macOS: `~/Library/Application Support/signal-cli/data/`
- Windows: `%APPDATA%\signal-cli\data\`

**Back up this directory** before server migration.

### Access Control
- Default `dmPolicy: pairing` is most secure
- Use `allowlist` for known numbers only
- Avoid `open` policy unless necessary

### Number Security
- Dedicated bot numbers are recommended
- Losing control of the number complicates recovery
- Consider VoIP numbers for easier management

## Advanced Configuration

### Multiple Accounts
```yaml
channels:
  signal:
    accounts:
      bot1:
        account: +15551234567
        dmPolicy: pairing
      bot2:
        account: +15559876543
        dmPolicy: allowlist
        allowFrom:
          - +15551111111
```

### External Daemon
If running signal-cli separately:
```yaml
channels:
  signal:
    httpUrl: "http://127.0.0.1:8080"
    autoStart: false
```

Start daemon manually:
```bash
signal-cli -a +15551234567 daemon --json-rpc --http 127.0.0.1:8080
```

### Media Handling
```yaml
channels:
  signal:
    mediaMaxMb: 16  # Increase from default 8MB
    ignoreAttachments: false  # Download attachments
```

## Resources
- [signal-cli GitHub](https://github.com/AsamK/signal-cli)
- [signal-cli Wiki](https://github.com/AsamK/signal-cli/wiki)
- [Registration with Captcha](https://github.com/AsamK/signal-cli/wiki/Registration-with-captcha)
- [Linking Devices](https://github.com/AsamK/signal-cli/wiki/Linking-other-devices-(Provisioning))
- [JSON-RPC API](https://github.com/AsamK/signal-cli/blob/master/man/signal-cli-json-rpc.5.adoc)
