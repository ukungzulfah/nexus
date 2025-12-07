# Alert System - Quick Reference

## Setup Channels

### Telegram
```typescript
channels: {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    chatId: process.env.TELEGRAM_CHAT_ID!
  }
}
```

### Discord
```typescript
channels: {
  discord: {
    webhookUrl: process.env.DISCORD_WEBHOOK_URL!
  }
}
```

### Slack
```typescript
channels: {
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL!
  }
}
```

### Webhook (Custom)
```typescript
channels: {
  webhook: {
    url: 'https://your-service.com/alerts'
  }
}
```

### Multiple Channels
```typescript
channels: {
  slack: { webhookUrl: '...' },
  telegram: { botToken: '...', chatId: '...' },
  discord: { webhookUrl: '...' }
}
```

---

## Define Alerts

### Basic Alert
```typescript
{
  name: 'Alert Name',
  condition: 'metric > threshold',
  window: '5m',
  threshold: 0.05,
  channels: ['slack', 'telegram']
}
```

### Condition Operators
- `>` - Greater than
- `<` - Less than
- `>=` - Greater than or equal
- `<=` - Less than or equal

### Example Conditions
```typescript
'error_rate > 0.05'        // 5% errors
'response_time > 1000'     // 1000ms
'memory > 0.8'             // 80%
'uptime < 1'               // 100% uptime
'db_errors >= 10'          // 10+ errors
```

---

## Usage Patterns

### Development
```typescript
alerting: {
  enabled: true,
  channels: { console: {} },
  alerts: [{
    name: 'Test',
    condition: 'value > 1',
    window: '5m',
    threshold: 1,
    channels: ['console']
  }]
}
```

### Production (Multi-Channel)
```typescript
alerting: {
  enabled: true,
  channels: {
    slack: { webhookUrl: process.env.SLACK_WEBHOOK_URL! },
    telegram: { 
      botToken: process.env.TELEGRAM_BOT_TOKEN!,
      chatId: process.env.TELEGRAM_CHAT_ID!
    },
    discord: { webhookUrl: process.env.DISCORD_WEBHOOK_URL! }
  },
  alerts: [
    // WARNING level
    { name: 'High Memory', condition: 'memory > 0.7', window: '5m', threshold: 0.7, channels: ['slack'] },
    // CRITICAL level
    { name: 'Server Down', condition: 'uptime < 1', window: '1m', threshold: 1, channels: ['slack', 'telegram'] },
    // EMERGENCY level
    { name: 'Critical Error', condition: 'error_rate > 0.5', window: '1m', threshold: 0.5, channels: ['slack', 'telegram', 'discord'] }
  ]
}
```

---

## API Methods

### Check & Trigger Alert
```typescript
await observability.alertManager?.checkAndTrigger('Alert Name', value);
```

### Get Alert History
```typescript
const history = observability.getAlertHistory();
// Returns: [{ alert, timestamp, value }, ...]
```

### Get Adapter Registry
```typescript
const registry = observability.alertManager?.getAdapterRegistry();

// Get all adapters
registry?.getNames();
// ['slack', 'telegram', 'discord', 'webhook', 'email', 'pagerduty', 'console']

// Check if adapter exists
registry?.has('telegram');  // true

// Register custom adapter
registry?.register('custom', customAdapter);

// Unregister adapter
registry?.unregister('console');
```

---

## Custom Adapter Template

```typescript
import { AlertChannelAdapter, AlertDefinition } from './nexus/advanced/observability';

class MyCustomAdapter implements AlertChannelAdapter {
  async send(alert: AlertDefinition, value: any, config: any): Promise<void> {
    // Your implementation
    console.log(`Alert: ${alert.name}, Value: ${value}`);
  }

  validate(config: any): boolean {
    // Validate config
    return !!config.someRequiredField;
  }
}

// Register & use
registry?.register('my-custom', new MyCustomAdapter());
```

---

## Environment Variables Template

```bash
# Telegram
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN
TELEGRAM_CHAT_ID=YOUR_CHAT_ID

# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Discord
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Webhook
WEBHOOK_URL=https://your-service.com/alerts

# PagerDuty
PAGERDUTY_ROUTING_KEY=your-routing-key

# Email
EMAIL_RECIPIENTS=admin@example.com,ops@example.com
```

---

## Debugging

### Test Alert Trigger
```typescript
// Manual trigger
await observability.alertManager?.checkAndTrigger('Test Alert', 100);
```

### View Alert History
```typescript
const history = observability.getAlertHistory();
console.log(history);
```

### Check Adapter Status
```typescript
const registry = observability.alertManager?.getAdapterRegistry();
console.log('Available adapters:', registry?.getNames());
```

### Validate Channel Config
```typescript
const adapter = registry?.get('telegram');
const isValid = adapter?.validate({
  botToken: 'YOUR_TOKEN',
  chatId: 'YOUR_CHAT_ID'
});
console.log('Config valid:', isValid);
```

---

## Common Issues

| Issue | Solution |
|-------|----------|
| Alert not triggered | Check `enabled: true`, check condition, check threshold |
| Config invalid | Validate using `adapter.validate(config)` |
| Adapter not found | Register adapter: `registry?.register(name, adapter)` |
| Network error | Check webhook URL, check internet connection |
| Rate limited | Alerts have 60s cooldown to prevent spam |
| Wrong channel | Check `channels` array in alert definition |

---

## Cooldown Behavior

- Alert triggered → cooldown starts (60 seconds)
- Same alert within 60s → ignored (prevented)
- Different alert → triggered immediately
- After 60s → can trigger again

```typescript
// Time: 0s
await observability.alertManager?.checkAndTrigger('Alert A', 100);  // ✅ Triggered

// Time: 5s
await observability.alertManager?.checkAndTrigger('Alert A', 100);  // ❌ Ignored (cooldown)

// Time: 61s
await observability.alertManager?.checkAndTrigger('Alert A', 100);  // ✅ Triggered

// Time: 66s
await observability.alertManager?.checkAndTrigger('Alert B', 100);  // ✅ Different alert
```

---

## Resources

- **Full Documentation**: `documentation/16-alerts-system.md`
- **Adapter Guide**: `documentation/17-alert-adapters.md`
- **Implementation Summary**: `documentation/18-alerts-implementation-summary.md`
- **Examples**: `example-alerts.ts`
- **Source Code**: `src/advanced/observability/adapters.ts`

---

**Last Updated:** 2025-12-03
**Status:** Production Ready ✅

