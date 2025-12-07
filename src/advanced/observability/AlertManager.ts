import { AlertChannelAdapterRegistry, AlertChannelAdapter, AlertDefinition as BaseAlertDefinition } from './adapters';
import { AlertingOptions } from './types';

/**
 * Alert manager for monitoring alerts with adapter-based channel system
 */
export class AlertManager {
    private options: AlertingOptions;
    private alertHistory: Array<{ alert: string; timestamp: number; value: any; }> = [];
    private alertState: Map<string, { lastTriggered: number; count: number; }> = new Map();
    private adapterRegistry: AlertChannelAdapterRegistry;
    private channelConfigs: Record<string, any> = {};

    constructor(options: AlertingOptions = {}) {
        this.options = options;
        this.adapterRegistry = new AlertChannelAdapterRegistry();

        // Store channel configurations
        if (options.channels) {
            this.channelConfigs = options.channels as Record<string, any>;
        }
    }

    /**
     * Register a custom alert channel adapter
     */
    registerAdapter(name: string, adapter: AlertChannelAdapter): void {
        this.adapterRegistry.register(name, adapter);
    }

    /**
     * Get the adapter registry
     */
    getAdapterRegistry(): AlertChannelAdapterRegistry {
        return this.adapterRegistry;
    }

    async checkAndTrigger(alertName: string, currentValue: number) {
        const alert = this.options.alerts?.find(a => a.name === alertName);
        if (!alert) return;

        const threshold = alert.threshold ?? 0;
        const shouldTrigger = this.evaluateCondition(alert.condition, currentValue, threshold);

        if (shouldTrigger) {
            const state = this.alertState.get(alertName) || { lastTriggered: 0, count: 0 };
            const now = Date.now();

            // Prevent alert flooding (minimum 1 minute between same alerts)
            if (now - state.lastTriggered > 60000) {
                state.lastTriggered = now;
                state.count++;
                this.alertState.set(alertName, state);

                this.alertHistory.push({ alert: alertName, timestamp: now, value: currentValue });

                await this.sendAlert(alert, currentValue);
            }
        }
    }

    private evaluateCondition(condition: string, value: number, threshold: number): boolean {
        // Simple condition parsing: "error_rate > 0.05" or "p95_duration > 1000"
        if (condition.includes('>')) {
            return value > threshold;
        }
        if (condition.includes('<')) {
            return value < threshold;
        }
        if (condition.includes('>=')) {
            return value >= threshold;
        }
        if (condition.includes('<=')) {
            return value <= threshold;
        }
        return false;
    }

    private async sendAlert(alert: BaseAlertDefinition, value: any) {
        for (const channelName of alert.channels) {
            try {
                const adapter = this.adapterRegistry.get(channelName);
                if (!adapter) {
                    console.warn(`No adapter registered for channel: ${channelName}`);
                    continue;
                }

                const config = this.channelConfigs[channelName];
                if (!config) {
                    console.warn(`No configuration for channel: ${channelName}`);
                    continue;
                }

                if (!adapter.validate(config)) {
                    console.warn(`Invalid configuration for channel: ${channelName}`);
                    continue;
                }

                await adapter.send(alert, value, config);
            } catch (error) {
                console.error(`Failed to send alert to ${channelName}:`, error);
            }
        }
    }

    getAlertHistory() {
        return [...this.alertHistory];
    }
}
