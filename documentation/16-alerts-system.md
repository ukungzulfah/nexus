# Alert System (Event-Driven Monitoring)

## Overview

Nexus memiliki sistem alerting yang powerful dan fleksibel untuk memantau kondisi aplikasi secara real-time. Sistem ini terintegrasi dengan **ObservabilityCenter** dan memungkinkan kamu mengirim notifikasi melalui berbagai channel seperti Slack, Email, Webhook, dan PagerDuty.

### Fitur Utama

- ✅ **Alert Rules yang Fleksibel** - Define kondisi kapan alert harus trigger
- ✅ **Multiple Notification Channels** - Slack, Email, Webhook, PagerDuty
- ✅ **Alert State Management** - Prevent alert flooding dengan cooldown period
- ✅ **Alert History** - Track semua alert yang telah trigger
- ✅ **User Control** - Enable/disable alerting sesuai kebutuhan
- ✅ **Real-time Monitoring** - Monitoring metrics dan system health secara real-time

---

## Quick Start

### 1. Basic Setup

```typescript
import { createApp } from './nexus';
import { ObservabilityCenter } from './nexus/advanced/observability';

const observability = new ObservabilityCenter({
  alerting: {
    enabled: true,
    channels: {
      slack: {
        webhookUrl: process.env.SLACK_WEBHOOK_URL!
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

const app = createApp({
  observability
});
```

### 2. Trigger Alert Manually

```typescript
// Check dan trigger alert
await observability.alertManager?.checkAndTrigger('High Error Rate', 0.08);
```

### 3. View Alert History

```typescript
// Get semua alert yang sudah trigger
const history = observability.getAlertHistory();
console.log(history);
// [
//   {
//     alert: 'High Error Rate',
//     timestamp: 1701619200000,
//     value: 0.08
//   }
// ]
```

---

## Configuration

### AlertingOptions

```typescript
interface AlertingOptions {
  enabled?: boolean;                    // Enable/disable alerting
  alerts?: AlertDefinition[];           // Daftar alert rules
  channels?: {
    slack?: { webhookUrl: string };
    email?: { recipients: string[] };
    pagerduty?: { routingKey: string };
    webhook?: { url: string };
  };
}
```

### AlertDefinition

```typescript
interface AlertDefinition {
  name: string;                    // Nama unik untuk alert
  condition: string;               // Kondisi trigger (misal: "error_rate > 0.05")
  window: string;                  // Time window (misal: "5m", "1h")
  channels: string[];              // Channel mana yang digunakan
  threshold?: number;              // Threshold value untuk evaluasi kondisi
}
```

---

## Alert Channels

### 1. Slack

Mengirim alert ke Slack channel melalui Webhook.

**Setup:**

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
        name: 'Server Error',
        condition: 'error_rate > 0.1',
        window: '5m',
        threshold: 0.1,
        channels: ['slack']
      }
    ]
  }
});
```

**Format Pesan:**

```
🚨 Alert: Server Error
━━━━━━━━━━━━━━━━━━━━━
Condition: error_rate > 0.1
Current Value: 0.15
```

**Get Slack Webhook URL:**
1. Go to Slack Workspace Settings
2. Create Incoming Webhook
3. Copy Webhook URL ke env variable

---

### 2. Email

Mengirim alert via Email.

**Setup:**

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

**Note:** Implementasi email memerlukan external service (sendgrid, mailgun, etc). Saat ini alert akan di-log ke console.

---

### 3. Webhook

Mengirim alert ke custom endpoint via HTTP POST.

**Setup:**

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
        name: 'High Memory Usage',
        condition: 'memory_usage > 0.9',
        window: '1m',
        threshold: 0.9,
        channels: ['webhook']
      }
    ]
  }
});
```

**Payload yang dikirim:**

```json
{
  "alert": "High Memory Usage",
  "condition": "memory_usage > 0.9",
  "value": 0.92,
  "timestamp": 1701619200000
}
```

---

### 4. PagerDuty

Mengirim alert ke PagerDuty untuk incident management.

**Setup:**

```typescript
const observability = new ObservabilityCenter({
  alerting: {
    enabled: true,
    channels: {
      pagerduty: {
        routingKey: 'your-pagerduty-routing-key'
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

**Note:** Implementasi PagerDuty memerlukan API integration. Saat ini alert akan di-log ke console.

---

## Alert Conditions

Alert conditions menggunakan format sederhana dengan comparison operators:

### Supported Operators

- `>` : Greater than
- `<` : Less than
- `>=` : Greater than or equal
- `<=` : Less than or equal

### Contoh Conditions

```typescript
// Error rate alerts
'error_rate > 0.05'           // 5% error rate
'error_rate > 0.1'            // 10% error rate

// Response time alerts
'p95_duration > 1000'         // P95 response time > 1000ms
'avg_duration > 500'          // Average response time > 500ms

// Memory alerts
'memory_usage > 0.8'          // Memory usage > 80%
'memory_growth > 0.5'         // Memory growth > 50%

// Database alerts
'query_duration > 5000'       // Query duration > 5 seconds
'slow_query_count > 10'       // More than 10 slow queries

// Uptime alerts
'uptime < 0.99'               // Uptime < 99%
```

---

## Using with Observability Middleware

### Setup Complete Monitoring Pipeline

```typescript
import { createApp } from './nexus';
import { ObservabilityCenter, createObservabilityMiddleware } from './nexus/advanced/observability';

const observability = new ObservabilityCenter({
  metrics: {
    enabled: true,
    format: 'prometheus'
  },
  logging: {
    level: 'info',
    format: 'json'
  },
  tracing: {
    enabled: true,
    exporter: 'console'
  },
  apm: {
    enabled: true,
    slowQueryThreshold: 1000
  },
  alerting: {
    enabled: true,
    channels: {
      slack: {
        webhookUrl: process.env.SLACK_WEBHOOK_URL!
      }
    },
    alerts: [
      {
        name: 'High Response Time',
        condition: 'response_time > 2000',
        window: '5m',
        threshold: 2000,
        channels: ['slack']
      }
    ]
  }
});

const app = createApp();

// Register observability middleware
app.use(createObservabilityMiddleware(observability, observability.options));

// Register observability routes
app.get('/metrics', observability.metricsHandler());
app.get('/health', observability.healthHandler());

// Your routes
app.get('/api/users', async (ctx) => {
  // Your logic
  return ctx.json({ users: [] });
});

export default app;
```

---

## Accessing Alert Data

### Get Alert History

```typescript
const history = observability.getAlertHistory();

// Filter by alert name
const errorAlerts = history.filter(a => a.alert === 'High Error Rate');

// Filter by time range
const recentAlerts = history.filter(
  a => a.timestamp > Date.now() - 1000 * 60 * 5  // Last 5 minutes
);

console.log(history);
// Output:
// [
//   {
//     alert: 'High Error Rate',
//     timestamp: 1701619200000,
//     value: 0.08
//   },
//   {
//     alert: 'High Response Time',
//     timestamp: 1701619205000,
//     value: 2500
//   }
// ]
```

### Get Memory Statistics

```typescript
const memoryStats = observability.getMemoryStats();

console.log(memoryStats);
// Output:
// {
//   current: {
//     heapUsed: 25000000,      // Bytes
//     heapTotal: 50000000,
//     external: 1000000,
//     rss: 60000000
//   },
//   history: [
//     { timestamp: 1701619200000, heapUsed: 24000000, heapTotal: 50000000 },
//     { timestamp: 1701619260000, heapUsed: 25000000, heapTotal: 50000000 }
//   ]
// }
```

### Get Slow Queries

```typescript
const slowQueries = observability.getSlowQueries();

console.log(slowQueries);
// Output:
// [
//   {
//     query: 'SELECT * FROM users WHERE ...',
//     duration: 2500,
//     timestamp: 1701619200000
//   }
// ]
```

---

## Alert Prevention (Cooldown)

Sistem otomatis mencegah alert flooding dengan cooldown period **1 menit** antara alert dengan nama yang sama.

```typescript
// Alert pertama - TRIGGERED ✅
await observability.alertManager?.checkAndTrigger('High Error Rate', 0.08);

// Alert kedua dalam 1 menit - IGNORED (cooldown)
await observability.alertManager?.checkAndTrigger('High Error Rate', 0.09);

// Alert setelah 1 menit - TRIGGERED ✅
// (wait 60 seconds)
await observability.alertManager?.checkAndTrigger('High Error Rate', 0.10);
```

---

## Multiple Channels

Kamu bisa mengirim satu alert ke multiple channels sekaligus.

```typescript
const observability = new ObservabilityCenter({
  alerting: {
    enabled: true,
    channels: {
      slack: {
        webhookUrl: 'https://hooks.slack.com/...'
      },
      email: {
        recipients: ['admin@example.com']
      },
      webhook: {
        url: 'https://your-service.com/alerts'
      }
    },
    alerts: [
      {
        name: 'Critical System Error',
        condition: 'error_rate > 0.5',
        window: '1m',
        threshold: 0.5,
        channels: ['slack', 'email', 'webhook']  // Multiple channels!
      }
    ]
  }
});
```

---

## Enable/Disable Alerts

### Disable All Alerts

```typescript
const observability = new ObservabilityCenter({
  alerting: {
    enabled: false  // All alerts disabled
  }
});
```

### Disable Specific Channel

Ubah konfigurasi channels untuk tidak include channel tertentu:

```typescript
const observability = new ObservabilityCenter({
  alerting: {
    enabled: true,
    channels: {
      slack: {
        webhookUrl: process.env.SLACK_WEBHOOK_URL!
      }
      // Email channel tidak ada = alert tidak bisa kirim email
    },
    alerts: [
      {
        name: 'Critical Error',
        condition: 'error_rate > 0.5',
        window: '1m',
        threshold: 0.5,
        channels: ['slack']  // Hanya Slack, tidak ada email
      }
    ]
  }
});
```

---

## Common Patterns

### Pattern 1: Production Alert Only

```typescript
const alerting = process.env.NODE_ENV === 'production' ? {
  enabled: true,
  channels: {
    slack: { webhookUrl: process.env.SLACK_WEBHOOK_URL! }
  },
  alerts: [/* ... */]
} : {
  enabled: false
};

const observability = new ObservabilityCenter({ alerting });
```

### Pattern 2: Different Alerts for Different Severity

```typescript
const observability = new ObservabilityCenter({
  alerting: {
    enabled: true,
    channels: {
      slack: { webhookUrl: process.env.SLACK_WEBHOOK_URL! },
      email: { recipients: ['critical@example.com'] }
    },
    alerts: [
      // WARNING level - Slack only
      {
        name: 'Warning: High Memory',
        condition: 'memory_usage > 0.7',
        window: '5m',
        threshold: 0.7,
        channels: ['slack']
      },
      // CRITICAL level - Slack + Email
      {
        name: 'Critical: Server Down',
        condition: 'uptime < 1',
        window: '1m',
        threshold: 1,
        channels: ['slack', 'email']
      }
    ]
  }
});
```

### Pattern 3: Environment-based Thresholds

```typescript
const isDev = process.env.NODE_ENV === 'development';

const observability = new ObservabilityCenter({
  alerting: {
    enabled: !isDev,
    channels: { slack: { webhookUrl: process.env.SLACK_WEBHOOK_URL! } },
    alerts: [
      {
        name: 'High Error Rate',
        condition: 'error_rate > ' + (isDev ? '0.5' : '0.05'),
        window: '5m',
        threshold: isDev ? 0.5 : 0.05,
        channels: ['slack']
      }
    ]
  }
});
```

---

## Alert History API

Kamu bisa query alert history untuk:
- Dashboard/UI
- Statistics/Analytics
- Debugging
- Audit trail

```typescript
// Get semua alert
const all = observability.getAlertHistory();

// Get alert dalam 1 jam terakhir
const oneHourAgo = Date.now() - 1000 * 60 * 60;
const recent = all.filter(a => a.timestamp > oneHourAgo);

// Group by alert name
const grouped = all.reduce((acc, alert) => {
  if (!acc[alert.alert]) acc[alert.alert] = [];
  acc[alert.alert].push(alert);
  return acc;
}, {} as Record<string, typeof all>);

// Count alerts by type
const counts = Object.entries(grouped).map(([name, alerts]) => ({
  name,
  count: alerts.length,
  lastTriggered: Math.max(...alerts.map(a => a.timestamp))
}));

console.log(counts);
```

---

## Best Practices

### 1. Set Reasonable Thresholds

```typescript
// ❌ BAD - Alert terlalu sering
{
  name: 'High Error Rate',
  threshold: 0.001,  // 0.1% error rate
  channels: ['slack']
}

// ✅ GOOD - Reasonable threshold
{
  name: 'High Error Rate',
  threshold: 0.05,  // 5% error rate
  channels: ['slack']
}
```

### 2. Use Meaningful Alert Names

```typescript
// ❌ BAD - Tidak jelas
{ name: 'Alert 1' }
{ name: 'Threshold exceeded' }

// ✅ GOOD - Deskriptif
{ name: 'Critical: Database Connection Failed' }
{ name: 'Warning: High Memory Usage (>80%)' }
{ name: 'Error Rate Spike Detected' }
```

### 3. Include Context in Webhook Payload

```typescript
// Custom implementation bisa extend AlertManager
// untuk include context lebih detail
const payload = {
  alert: 'High Error Rate',
  severity: 'critical',
  affected_services: ['api', 'worker'],
  current_value: 0.08,
  threshold: 0.05,
  timestamp: new Date().toISOString(),
  runbook: 'https://docs.example.com/runbooks/high-error-rate'
};
```

### 4. Monitor Alert System Itself

```typescript
// Set alert untuk warning jika alerting disabled
if (!observability.options.alerting?.enabled) {
  console.warn('⚠️  Alerting system is DISABLED');
}

// Monitor alert delivery failures
const history = observability.getAlertHistory();
console.log(`Total alerts triggered: ${history.length}`);
```

---

## Troubleshooting

### Alert tidak trigger?

```typescript
// 1. Check apakah alerting enabled
console.log(observability.options.alerting?.enabled);

// 2. Check apakah alert definition ada
console.log(observability.options.alerting?.alerts);

// 3. Check cooldown - alert perlu wait 1 minute sebelum trigger lagi
const history = observability.getAlertHistory();
const lastAlert = history.find(a => a.alert === 'Your Alert Name');
console.log('Last triggered:', lastAlert?.timestamp);
```

### Alert terus spam?

```typescript
// Cooldown sudah built-in (1 minute)
// Tapi kamu bisa adjust logic di AlertManager jika perlu

// Or disable alert sementara
const observability = new ObservabilityCenter({
  alerting: { enabled: false }
});
```

### Webhook tidak terima alert?

```typescript
// 1. Check webhook URL
console.log(observability.options.alerting?.channels?.webhook?.url);

// 2. Test manual trigger
await observability.alertManager?.checkAndTrigger('Test Alert', 100);

// 3. Check browser console untuk error
```

---

## Next Steps

1. **Implement Telegram Channel** - Add support untuk Telegram notifications
2. **System Metrics Monitoring** - Monitor CPU, memory, disk automatically
3. **Server Crash Detection** - Detect dan alert ketika server crash
4. **Custom Webhooks** - Implement custom alert handlers
5. **Alert Dashboard** - Build UI untuk view/manage alerts

Lihat file-file lain di documentation untuk fitur yang related! 📚

