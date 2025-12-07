interface SimpleDataLoaderBatch<Key, Value> {
    keys: Key[];
    resolvers: Array<{ resolve: (value: Value) => void; reject: (error: Error) => void }>;
}

export class SimpleDataLoader<Key = any, Value = any> {
    private batch: SimpleDataLoaderBatch<Key, Value> | null = null;

    constructor(private batchLoadFn: (keys: Key[]) => Promise<Map<Key, Value>>) { }

    load(key: Key): Promise<Value> {
        if (!this.batch) {
            this.batch = { keys: [], resolvers: [] };
            queueMicrotask(() => this.dispatch());
        }

        return new Promise<Value>((resolve, reject) => {
            this.batch!.keys.push(key);
            this.batch!.resolvers.push({ resolve, reject });
        });
    }

    private async dispatch() {
        if (!this.batch) return;
        const current = this.batch;
        this.batch = null;

        try {
            const result = await this.batchLoadFn(current.keys);
            current.keys.forEach((key, index) => {
                const value = result.get(key);
                if (value === undefined) {
                    current.resolvers[index].reject(new Error(`DataLoader missing key "${String(key)}"`));
                } else {
                    current.resolvers[index].resolve(value);
                }
            });
        } catch (error) {
            current.resolvers.forEach(resolver => resolver.reject(error as Error));
        }
    }
}
