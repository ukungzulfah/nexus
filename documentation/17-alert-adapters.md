# Alert Channel Adapters

## Overview

Alert System di Nexus menggunakan **Adapter Pattern** untuk mendukung berbagai notification channels secara modular dan extensible. Kamu bisa:

- ✅ Menggunakan built-in adapters (Slack, Discord, Telegram, Email, PagerDuty, Webhook)
- ✅ Membuat custom adapter dengan mudah
- ✅ Register/unregister adapters secara dinamis
- ✅ Validasi konfigurasi per channel

---

## Built-in Adapters

### 1. Slack Adapter

Mengirim alert ke Slack channel via Webhook.

**Configuration:**

```typescript
const observability = new ObservabilityCenter({
  alerting: {
    enabled: true,
    channels: {
      slack: {
        webhookUrl: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
      }
    },
    alerts: [
      {
        name: 'High Error Rate',
        condition: 'error_rate > 0.05',
        window: '5m',
        threshold: 0.05,
        channels: ['slack']
      }
    ]
  }
});
```

**Get Webhook URL:**
1. Go to Slack Workspace Settings → Apps & Integrations
2. Create Incoming Webhooks
3. Copy the Webhook URL

---

### 2. Telegram Adapter ✨

Mengirim alert ke Telegram chat.

**Configuration:**

```typescript
const observability = new ObservabilityCenter({
  alerting: {
    enabled: true,
    channels: {
      telegram: {
        botToken: 'YOUR_BOT_TOKEN',
        chatId: 'YOUR_CHAT_ID'
      }
    },
    alerts: [
      {
        name: 'Server Down',
        condition: 'uptime < 1',
        window: '1m',
        threshold: 1,
        channels: ['telegram']
      }
    ]
  }
});
```

**Setup Telegram Bot:**

1. Talk to BotFather on Telegram
   - Search for `@BotFather`
   - Send `/start`
   - Send `/newbot`
   - Follow instructions to create bot
   - Copy the bot token

2. Get Chat ID
   - Send a message to your bot
   - Visit `https://api.telegram.org/bot{BOT_TOKEN}/getUpdates`
   - Find your chat ID in the response

3. Set environment variables

```bash
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklmnoPQRstUVwxyz
TELEGRAM_CHAT_ID=987654321
```

**Message Format:**

```
🚨 Alert: Server Down

Condition: uptime < 1
Current Value: 0
Time: 2025-12-03T10:30:00.000Z
```

---

### 3. Discord Adapter ✨

Mengirim alert ke Discord channel.

**Configuration:**

```typescript
const observability = new ObservabilityCenter({
  alerting: {
    enabled: true,
    channels: {
      discord: {
        webhookUrl: 'https://discord.com/api/webhooks/YOUR/WEBHOOK/URL'
      }
    },
    alerts: [
      {
        name: 'High Memory Usage',
        condition: 'memory_usage > 0.9',
        window: '1m',
        threshold: 0.9,
        channels: ['discord']
      }
    ]
  }
});
```

**Get Webhook URL:**

1. Open Discord server and go to channel settings
2. Go to Integrations → Webhooks
3. Create Webhook
4. Copy the Webhook URL

**Message Format:**

```
🚨 Alert: High Memory Usage
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Condition: memory_usage > 0.9
Current Value: 0.92
Time: 2025-12-03T10:30:00.000Z
```

---

### 4. Webhook Adapter

Generic HTTP endpoint untuk custom integration.

**Configuration:**

```typescript
const observability = new ObservabilityCenter({
  alerting: {
    enabled: true,
    channels: {
      webhook: {
        url: 'https://your-service.com/alerts'
      }
    },
    alerts: [
      {
        name: 'Database Error',
        condition: 'db_errors > 10',
        window: '5m',
        threshold: 10,
        channels: ['webhook']
      }
    ]
  }
});
```

**Payload yang dikirim:**

```json
{
  "alert": "Database Error",
  "condition": "db_errors > 10",
  "value": 15,
  "timestamp": 1701619200000
}
```

---

### 5. Email Adapter

Mengirim alert via email.

**Configuration:**

```typescript
const observability = new ObservabilityCenter({
  alerting: {
    enabled: true,
    channels: {
      email: {
        recipients: ['admin@example.com', 'ops@example.com']
      }
    },
    alerts: [
      {
        name: 'Critical Error',
        condition: 'error_rate > 0.5',
        window: '1m',
        threshold: 0.5,
        channels: ['email']
      }
    ]
  }
});
```

**Note:** Default implementation adalah console logging. Untuk production, kamu perlu extend adapter untuk integrate dengan email service seperti SendGrid atau Mailgun.

---

### 6. PagerDuty Adapter

Integration dengan PagerDuty untuk incident management.

**Configuration:**

```typescript
const observability = new ObservabilityCenter({
  alerting: {
    enabled: true,
    channels: {
      pagerduty: {
        routingKey: 'YOUR_PAGERDUTY_ROUTING_KEY'
      }
    },
    alerts: [
      {
        name: 'Service Down',
        condition: 'uptime < 1',
        window: '1m',
        threshold: 1,
        channels: ['pagerduty']
      }
    ]
  }
});
```

**Note:** Default implementation adalah console logging. Untuk production, extend adapter dengan PagerDuty Events API v2.

---

### 7. Console Adapter

Testing dan debugging alerts tanpa external dependencies.

**Configuration:**

```typescript
const observability = new ObservabilityCenter({
  alerting: {
    enabled: true,
    channels: {
      console: {}  // No config needed
    },
    alerts: [
      {
        name: 'Test Alert',
        condition: 'test > 1',
        window: '1m',
        threshold: 1,
        channels: ['console']
      }
    ]
  }
});
```

**Output:**

```
[ALERT] 2025-12-03T10:30:00.000Z
  Name: Test Alert
  Condition: test > 1
  Current Value: 2
```

---

## Custom Alert Adapters

### Creating a Custom Adapter

Implement `AlertChannelAdapter` interface:

```typescript
import { AlertChannelAdapter, AlertDefinition } from './nexus/advanced/observability';

class SlackCommandsAdapter implements AlertChannelAdapter {
  async send(alert: AlertDefinition, value: any, config: any): Promise<void> {
    // Your implementation
    console.log(`Sending alert: ${alert.name}`);
    
    // Call your custom API
    await fetch('https://slack.com/custom-endpoint', {
      method: 'POST',
      body: JSON.stringify({ alert: alert.name, value })
    });
  }

  validate(config: any): boolean {
    // Validate configuration
    return config.webhookUrl && typeof config.webhookUrl === 'string';
  }
}
```

### Register Custom Adapter

```typescript
const observability = new ObservabilityCenter({
  alerting: { enabled: true, channels: {} }
});

// Get adapter registry
const registry = observability.alertManager?.getAdapterRegistry();

// Register custom adapter
const customAdapter = new SlackCommandsAdapter();
registry?.register('slack-commands', customAdapter);

// Now use it in alerts
const observability2 = new ObservabilityCenter({
  alerting: {
    enabled: true,
    channels: {
      'slack-commands': { webhookUrl: 'https://...' }
    },
    alerts: [
      {
        name: 'Custom Alert',
        condition: 'value > 100',
        window: '5m',
        threshold: 100,
        channels: ['slack-commands']
      }
    ]
  }
});
```

---

## Multiple Channels

Kirim satu alert ke multiple channels sekaligus:

```typescript
const observability = new ObservabilityCenter({
  alerting: {
    enabled: true,
    channels: {
      slack: { webhookUrl: 'https://hooks.slack.com/...' },
      telegram: { botToken: 'YOUR_TOKEN', chatId: 'YOUR_CHAT_ID' },
      discord: { webhookUrl: 'https://discord.com/api/webhooks/...' },
      webhook: { url: 'https://your-service.com/alerts' }
    },
    alerts: [
      {
        name: 'Critical System Alert',
        condition: 'error_rate > 0.5',
        window: '1m',
        threshold: 0.5,
        channels: ['slack', 'telegram', 'discord', 'webhook']  // All 4!
      }
    ]
  }
});
```

---

## Channel Configuration Validation

Setiap adapter melakukan validasi konfigurasi sebelum mengirim alert:

```typescript
// Invalid Slack config - alert tidak dikirim
const observability = new ObservabilityCenter({
  alerting: {
    enabled: true,
    channels: {
      slack: {
        webhookUrl: 'not-a-valid-url'  // ❌ Invalid
      }
    },
    alerts: [/* ... */]
  }
});

// Console output: "Invalid configuration for channel: slack"
```

---

## Common Patterns

### Pattern 1: Multi-severity Alerts

```typescript
const observability = new ObservabilityCenter({
  alerting: {
    enabled: true,
    channels: {
      slack: { webhookUrl: process.env.SLACK_WEBHOOK_URL! },
      telegram: { 
        botToken: process.env.TELEGRAM_BOT_TOKEN!,
        chatId: process.env.TELEGRAM_CHAT_ID!
      }
    },
    alerts: [
      // WARNING - Slack only
      {
        name: 'Warning: High Memory',
        condition: 'memory > 0.7',
        window: '5m',
        threshold: 0.7,
        channels: ['slack']
      },
      // CRITICAL - Slack + Telegram
      {
        name: 'Critical: Server Down',
        condition: 'uptime < 1',
        window: '1m',
        threshold: 1,
        channels: ['slack', 'telegram']
      },
      // EMERGENCY - All channels
      {
        name: 'Emergency: Database Disconnected',
        condition: 'db_connected < 1',
        window: '1m',
        threshold: 1,
        channels: ['slack', 'telegram', 'discord', 'webhook']
      }
    ]
  }
});
```

### Pattern 2: Environment-based Channels

```typescript
const channels = {
  slack: { webhookUrl: process.env.SLACK_WEBHOOK_URL! },
  // Add Telegram only in production
  ...(process.env.NODE_ENV === 'production' && {
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN!,
      chatId: process.env.TELEGRAM_CHAT_ID!
    }
  }),
  // Add Discord in staging and production
  ...(process.env.NODE_ENV !== 'development' && {
    discord: { webhookUrl: process.env.DISCORD_WEBHOOK_URL! }
  })
};

const observability = new ObservabilityCenter({
  alerting: {
    enabled: true,
    channels,
    alerts: [/* ... */]
  }
});
```

### Pattern 3: Custom adapter dengan Redis

```typescript
import { AlertChannelAdapter, AlertDefinition } from './nexus/advanced/observability';
import Redis from 'redis';

class RedisAlertAdapter implements AlertChannelAdapter {
  private redis: Redis.RedisClient;

  constructor(redisClient: Redis.RedisClient) {
    this.redis = redisClient;
  }

  async send(alert: AlertDefinition, value: any, config: any): Promise<void> {
    // Store alert di Redis queue untuk processing asynchronous
    await this.redis.lpush(
      'alerts:queue',
      JSON.stringify({
        alert: alert.name,
        value,
        timestamp: Date.now(),
        channel: config.queueName
      })
    );
  }

  validate(config: any): boolean {
    return config.queueName && typeof config.queueName === 'string';
  }
}

// Usage
const redis = Redis.createClient();
const customAdapter = new RedisAlertAdapter(redis);

const observability = new ObservabilityCenter({
  alerting: { enabled: true, channels: {} }
});

observability.alertManager?.getAdapterRegistry()?.register('redis', customAdapter);
```

---

## Adapter Registry API

### Get all registered adapters

```typescript
const registry = observability.alertManager?.getAdapterRegistry();
const names = registry?.getNames();
// ['slack', 'webhook', 'email', 'pagerduty', 'telegram', 'discord', 'console']
```

### Check if adapter exists

```typescript
const has = registry?.has('telegram');
// true
```

### Unregister adapter

```typescript
registry?.unregister('console');
// Now console alerts won't work
```

---

## Error Handling

Adapter otomatis handle errors:

```typescript
// Invalid channel config
// → Warning logged, alert skipped for that channel

// Adapter throws error
// → Error logged, continues to next channel

// Invalid webhook URL
// → Validation fails, alert skipped

// Network timeout
// → Fetch error caught, logged

try {
  await observability.alertManager?.checkAndTrigger('Test Alert', 100);
} catch (error) {
  console.error('Alert check failed:', error);
}
```

---

## Best Practices

### 1. Validate Configurations

```typescript
// ❌ BAD - No validation
const alerting = {
  channels: {
    telegram: {
      botToken: '',  // Empty!
      chatId: ''     // Empty!
    }
  }
};

// ✅ GOOD - Validate before using
const alerting = {
  channels: {
    telegram: {
      botToken: process.env.TELEGRAM_BOT_TOKEN!,
      chatId: process.env.TELEGRAM_CHAT_ID!
    }
  }
};

if (!alerting.channels.telegram.botToken) {
  throw new Error('TELEGRAM_BOT_TOKEN is required');
}
```

### 2. Use Adapter Registry for Runtime Changes

```typescript
// Add new channel dynamically
const newAdapter = new TelegramAlertAdapter();
observability.alertManager?.getAdapterRegistry()?.register('telegram-prod', newAdapter);

// Update alerts to use new channel
```

### 3. Test Adapters

```typescript
// Use console adapter for testing
const testObservability = new ObservabilityCenter({
  alerting: {
    enabled: true,
    channels: {
      console: {}
    },
    alerts: [
      {
        name: 'Test',
        condition: 'value > 1',
        window: '1m',
        threshold: 1,
        channels: ['console']
      }
    ]
  }
});

// Check output before using real channels
```

### 4. Graceful Fallbacks

```typescript
const channels = {
  slack: { webhookUrl: process.env.SLACK_WEBHOOK_URL },
  // Fallback ke console jika Slack tidak available
  ...(process.env.SLACK_WEBHOOK_URL ? {} : { console: {} })
};
```

---

## Troubleshooting

### Alert tidak terkirim

```typescript
// 1. Check adapter registered
const adapter = registry?.get('telegram');
console.log('Adapter exists:', !!adapter);

// 2. Check config valid
const isValid = adapter?.validate(config);
console.log('Config valid:', isValid);

// 3. Check channel configured
console.log('Channels:', observability.options.alerting?.channels);

// 4. Test manual trigger
await observability.alertManager?.checkAndTrigger('Test Alert', 100);
```

### Custom adapter tidak dikirim

```typescript
// Ensure adapter registered sebelum creating ObservabilityCenter
registry?.register('custom', customAdapter);

// Or register after initialization
observability.alertManager?.getAdapterRegistry()?.register('custom', customAdapter);
```

---

Referensi lengkap tentang Alert System ada di `16-alerts-system.md`. Lihat juga dokumentasi lain untuk fitur yang related! 📚

