import { EventEmitter } from 'events';

export interface RealtimeChange<TPayload = unknown> {
    table: string;
    type: 'insert' | 'update' | 'delete';
    payload: TPayload;
    timestamp: number;
}

export interface RealtimeConfig {
    enabled?: boolean;
    bufferSize?: number;
}

export class RealtimeDatabase<TPayload = unknown> {
    private readonly emitter = new EventEmitter();
    private readonly bufferSize: number;
    private readonly buffer: RealtimeChange<TPayload>[] = [];
    private enabled: boolean;

    constructor(config: RealtimeConfig = {}) {
        this.enabled = config.enabled ?? true;
        this.bufferSize = config.bufferSize ?? 100;
    }

    onChange(listener: (change: RealtimeChange<TPayload>) => void) {
        this.emitter.on('change', listener);
        return () => this.emitter.off('change', listener);
    }

    emit(change: RealtimeChange<TPayload>) {
        if (!this.enabled) return;

        this.buffer.push(change);
        if (this.buffer.length > this.bufferSize) {
            this.buffer.shift();
        }
        this.emitter.emit('change', change);
    }

    history(): RealtimeChange<TPayload>[] {
        return [...this.buffer];
    }

    pause() {
        this.enabled = false;
    }

    resume() {
        this.enabled = true;
    }
}

