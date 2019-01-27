import { Readable } from 'stream';

import { ConcurrentStream } from './stream';
import { applyDefaultOptions } from './util';

export interface ReadStreamOptions {
    start?: number;
    end?: number;
    highWaterMark?: number;
}

export class ReadStream extends Readable {
    private context: ConcurrentStream;
    private current: number;
    private end: number;
    private closed = false;

    constructor(context: ConcurrentStream, options?: ReadStreamOptions) {
        super(options);

        this.context = context;
        this.context.ref();

        options = applyDefaultOptions(options);
        this.current = options.start!;
        this.end = options.end!;
    }

    public async _read(size: number): Promise<void> {
        size = Math.min(size, this.end - this.current);
        if (size <= 0) {
            return this.destroy();
        }

        const buffer = Buffer.allocUnsafe(size);
        try {
            const bytesRead = await this.context.read(buffer, this.current);
            if (!bytesRead) {
                return this.destroy();
            }
            this.current += bytesRead;
            if (bytesRead < size) {
                this.push(buffer.slice(0, bytesRead));
            } else {
                this.push(buffer);
            }
            this.emit('read', bytesRead);
        } catch (err) {
            return this.destroy(err);
        }
    }

    public async _destroy(error: Error | null, callback: (error: Error | null) => void): Promise<void> {
        await this._close();
        this.push(null);
        callback(error);
    }

    private async _close(): Promise<void> {
        /* istanbul ignore if: double unref guard */
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.context.unref();
    }
}
