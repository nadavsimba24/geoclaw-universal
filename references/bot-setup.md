# Telegram + WhatsApp Setup Checklist

## Telegram Bot
1. Open Telegram → search **@BotFather**.
2. Run `/newbot`, choose display name + username.
3. Copy the HTTPS API token → store as `GEOCLAW_TELEGRAM_BOT_TOKEN`.
4. (Optional) Set `/setcommands` for quick actions like `status`, `skills`, `restart`.
5. Keep the bot private or restrict to allowed users through `/setuserpic` and `/setjoingroups`.

## WhatsApp Cloud API (Meta)
1. Go to <https://developers.facebook.com/apps> → Create App → “Other” → “Business”.
2. Under WhatsApp → **Getting Started** → Generate a temporary token.
3. Add a phone number ID (real or Meta sandbox) → note both `phone_number_id` and `business_account_id`.
4. Generate a permanent token (System Users → Add New → Assign WhatsApp permissions) and store as `GEOCLAW_WHATSAPP_CLOUD_TOKEN`.
5. Set the callback URL to your public webhook endpoint (Cloudflare Tunnel, Fly.io, etc.) and verify the token with a random string saved as `GEOCLAW_WHATSAPP_VERIFY_TOKEN`.

## Env Vars Summary
```
GEOCLAW_MODEL_API_KEY=sk-live...
GEOCLAW_MODEL_PROVIDER=openai
GEOCLAW_MODEL_NAME=gpt-4o-mini
GEOCLAW_TELEGRAM_BOT_TOKEN=...
GEOCLAW_WHATSAPP_PHONE_ID=...
GEOCLAW_WHATSAPP_CLOUD_TOKEN=...
GEOCLAW_WHATSAPP_VERIFY_TOKEN=...
```

## Testing
- Telegram: send `/ping` → expect `pong`.
- WhatsApp: use the Meta sandbox “Send message” tool to push a test string.
- Monitor `openclaw logs -f geoclaw` for webhook confirmations.
