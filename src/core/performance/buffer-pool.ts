/**
 * Performance optimizations - Buffer pooling
 * Zero-copy buffer handling for request/response bodies
 */

/**
 * Buffer pool for reusing buffers
 */
export class BufferPool {
    private pool: Buffer[] = [];
    private bufferSize: number;
    private maxPoolSize: number;

    constructor(bufferSize: number = 8192, maxPoolSize: number = 50) {
        this.bufferSize = bufferSize;
        this.maxPoolSize = maxPoolSize;
    }

    /**
     * Acquire a buffer from the pool
     */
    acquire(): Buffer {
        if (this.pool.length > 0) {
            return this.pool.pop()!;
        }
        return Buffer.allocUnsafe(this.bufferSize);
    }

    /**
     * Release a buffer back to the pool
     */
    release(buffer: Buffer): void {
        if (this.pool.length < this.maxPoolSize && buffer.length === this.bufferSize) {
            // Clear the buffer before returning to pool
            buffer.fill(0);
            this.pool.push(buffer);
        }
    }

    /**
     * Clear the pool
     */
    clear(): void {
        this.pool = [];
    }

    /**
     * Get pool statistics
     */
    getStats() {
        return {
            poolSize: this.pool.length,
            maxPoolSize: this.maxPoolSize,
            bufferSize: this.bufferSize
        };
    }
}

/**
 * Stream utilities for efficient data handling
 */
export class StreamUtils {
    /**
     * Read stream into buffer without copying
     */
    static async readStream(stream: NodeJS.ReadableStream, maxSize?: number): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            let totalSize = 0;

            stream.on('data', (chunk: Buffer) => {
                totalSize += chunk.length;

                if (maxSize && totalSize > maxSize) {
                    if (typeof (stream as any).destroy === 'function') {
                        (stream as any).destroy();
                    }
                    reject(new Error(`Stream size exceeds maximum of ${maxSize} bytes`));
                    return;
                }

                chunks.push(chunk);
            });

            stream.on('end', () => {
                resolve(Buffer.concat(chunks));
            });

            stream.on('error', reject);
        });
    }

    /**
     * Pipe stream with error handling
     */
    static pipeWithErrorHandling(
        source: NodeJS.ReadableStream,
        destination: NodeJS.WritableStream
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            source.pipe(destination);

            source.on('error', reject);
            destination.on('error', reject);
            destination.on('finish', resolve);
        });
    }
}
