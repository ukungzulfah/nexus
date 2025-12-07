/**
 * Alert Channel Adapters
 * 
 * Extensible adapter system for alert notification channels
 */

export interface AlertDefinition {
  name: string;
  condition: string;
  window: string;
  channels: string[];
  threshold?: number;
}

/**
 * Alert channel adapter interface
 * Implement this to add custom notification channels
 */
export interface AlertChannelAdapter {
  /**
   * Send alert notification through the channel
   * @param alert - Alert definition
   * @param value - Current metric value
   * @param config - Channel-specific configuration
   */
  send(alert: AlertDefinition, value: any, config: any): Promise<void>;

  /**
   * Validate channel configuration
   * @returns true if config is valid
   */
  validate(config: any): boolean;
}

/**
 * Slack alert adapter
 */
export class SlackAlertAdapter implements AlertChannelAdapter {
  async send(alert: AlertDefinition, value: any, config: { webhookUrl: string }): Promise<void> {
    if (!config.webhookUrl) {
      throw new Error('Slack webhook URL is required');
    }

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 Alert: ${alert.name}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Alert:* ${alert.name}\n*Condition:* ${alert.condition}\n*Current Value:* ${value}`
            }
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Slack alert failed: ${response.statusText}`);
    }
  }

  validate(config: { webhookUrl?: string }): boolean {
    return !!(config.webhookUrl && typeof config.webhookUrl === 'string' && config.webhookUrl.startsWith('https://'));
  }
}

/**
 * Webhook alert adapter (generic HTTP endpoint)
 */
export class WebhookAlertAdapter implements AlertChannelAdapter {
  async send(alert: AlertDefinition, value: any, config: { url: string }): Promise<void> {
    if (!config.url) {
      throw new Error('Webhook URL is required');
    }

    const response = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alert: alert.name,
        condition: alert.condition,
        value,
        timestamp: Date.now()
      })
    });

    if (!response.ok) {
      throw new Error(`Webhook alert failed: ${response.statusText}`);
    }
  }

  validate(config: { url?: string }): boolean {
    try {
      if (!config.url) return false;
      new URL(config.url);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Email alert adapter (console fallback - implement with real email service)
 */
export class EmailAlertAdapter implements AlertChannelAdapter {
  async send(alert: AlertDefinition, value: any, config: { recipients: string[] }): Promise<void> {
    if (!config.recipients || config.recipients.length === 0) {
      throw new Error('Email recipients are required');
    }

    // TODO: Integrate with real email service (SendGrid, Mailgun, etc.)
    console.log(`[EMAIL ALERT] To: ${config.recipients.join(', ')}`);
    console.log(`[EMAIL ALERT] Subject: Alert: ${alert.name}`);
    console.log(`[EMAIL ALERT] Body: ${alert.name} - Current Value: ${value}`);
  }

  validate(config: { recipients?: string[] }): boolean {
    return !!(
      config.recipients &&
      Array.isArray(config.recipients) &&
      config.recipients.length > 0 &&
      config.recipients.every(r => typeof r === 'string' && r.includes('@'))
    );
  }
}

/**
 * PagerDuty alert adapter
 */
export class PagerDutyAlertAdapter implements AlertChannelAdapter {
  async send(alert: AlertDefinition, value: any, config: { routingKey: string }): Promise<void> {
    if (!config.routingKey) {
      throw new Error('PagerDuty routing key is required');
    }

    // TODO: Implement real PagerDuty Events API v2 integration
    console.log(`[PAGERDUTY ALERT] Routing Key: ${config.routingKey}`);
    console.log(`[PAGERDUTY ALERT] Event: ${alert.name} - Value: ${value}`);
  }

  validate(config: { routingKey?: string }): boolean {
    return !!(config.routingKey && typeof config.routingKey === 'string' && config.routingKey.length > 0);
  }
}

/**
 * Telegram alert adapter
 */
export class TelegramAlertAdapter implements AlertChannelAdapter {
  async send(alert: AlertDefinition, value: any, config: { botToken: string; chatId: string }): Promise<void> {
    if (!config.botToken || !config.chatId) {
      throw new Error('Telegram bot token and chat ID are required');
    }

    const message = `🚨 *Alert: ${alert.name}*\n\nCondition: ${alert.condition}\nCurrent Value: ${value}\nTime: ${new Date().toISOString()}`;

    const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    if (!response.ok) {
      try {
        const error = await response.json() as Record<string, any>;
        throw new Error(`Telegram alert failed: ${error.description || response.statusText}`);
      } catch {
        throw new Error(`Telegram alert failed: ${response.statusText}`);
      }
    }
  }

  validate(config: { botToken?: string; chatId?: string }): boolean {
    return !!(
      config.botToken &&
      typeof config.botToken === 'string' &&
      config.botToken.length > 0 &&
      config.chatId &&
      typeof config.chatId === 'string' &&
      config.chatId.length > 0
    );
  }
}

/**
 * Discord alert adapter
 */
export class DiscordAlertAdapter implements AlertChannelAdapter {
  async send(alert: AlertDefinition, value: any, config: { webhookUrl: string }): Promise<void> {
    if (!config.webhookUrl) {
      throw new Error('Discord webhook URL is required');
    }

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `🚨 **Alert: ${alert.name}**`,
        embeds: [
          {
            title: alert.name,
            description: `**Condition:** ${alert.condition}\n**Current Value:** ${value}`,
            color: 15158332, // Red
            timestamp: new Date().toISOString()
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Discord alert failed: ${response.statusText}`);
    }
  }

  validate(config: { webhookUrl?: string }): boolean {
    try {
      if (!config.webhookUrl) return false;
      const url = new URL(config.webhookUrl);
      return url.hostname.includes('discord.com');
    } catch {
      return false;
    }
  }
}

/**
 * Console alert adapter (for testing/logging)
 */
export class ConsoleAlertAdapter implements AlertChannelAdapter {
  async send(alert: AlertDefinition, value: any, _config: any): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`\n[ALERT] ${timestamp}`);
    console.log(`  Name: ${alert.name}`);
    console.log(`  Condition: ${alert.condition}`);
    console.log(`  Current Value: ${value}\n`);
  }

  validate(_config: any): boolean {
    return true; // Console adapter doesn't need config
  }
}

/**
 * Alert channel adapter registry
 * Manages all available alert channel adapters
 */
export class AlertChannelAdapterRegistry {
  private adapters: Map<string, AlertChannelAdapter> = new Map();

  constructor() {
    // Register built-in adapters
    this.register('slack', new SlackAlertAdapter());
    this.register('webhook', new WebhookAlertAdapter());
    this.register('email', new EmailAlertAdapter());
    this.register('pagerduty', new PagerDutyAlertAdapter());
    this.register('telegram', new TelegramAlertAdapter());
    this.register('discord', new DiscordAlertAdapter());
    this.register('console', new ConsoleAlertAdapter());
  }

  /**
   * Register a new alert channel adapter
   */
  register(name: string, adapter: AlertChannelAdapter): void {
    this.adapters.set(name.toLowerCase(), adapter);
  }

  /**
   * Get an adapter by name
   */
  get(name: string): AlertChannelAdapter | undefined {
    return this.adapters.get(name.toLowerCase());
  }

  /**
   * Get all registered adapter names
   */
  getNames(): string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check if an adapter is registered
   */
  has(name: string): boolean {
    return this.adapters.has(name.toLowerCase());
  }

  /**
   * Remove an adapter
   */
  unregister(name: string): boolean {
    return this.adapters.delete(name.toLowerCase());
  }
}
