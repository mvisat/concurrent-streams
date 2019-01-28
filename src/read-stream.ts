import { Readable } from 'stream';

import { ConcurrentStream } from './stream';

export interface ReadStreamOptions {
    encoding?: string;
    start?: number;
    end?: number;
    highWaterMark?: number;
}

const defaultOptions: ReadStreamOptions = {
    start: 0,
    end: Infinity,
    highWaterMark: 128 * 1024,
};

function applyDefaultOptions(options?: ReadStreamOptions): ReadStreamOptions {
    options = { ...defaultOptions, ...options };
    if (typeof options.start !== 'number' || isNaN(options.start)) {
        throw new TypeError('"start" option must be a number');
    }
    if (typeof options.end !== 'number' || isNaN(options.end)) {
        throw new TypeError('"end" option must be a number');
    }
    if (options.start < 0 || options.end < 0) {
        throw new RangeError('"start" and "end" option must be >= 0');
    }
    if (!isFinite(options.start)) {
        throw new TypeError('"start" option must be finite');
    }
    if (options.start > options.end) {
        throw new RangeError('"start" option must be <= "end" option');
    }
    return options;
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

    public get position(): number {
        return this.current;
    }

    public async _read(size: number): Promise<void> {
        size = Math.min(size, this.end - this.position + 1);
        if (size <= 0) {
            return this.destroy();
        }

        const buffer = Buffer.allocUnsafe(size);
        try {
            const bytesRead = await this.context.read(buffer, 0, size, this.position);
            if (!bytesRead) {
                return this.destroy();
            }
            this.current += bytesRead;
            if (bytesRead < size) {
                this.push(buffer.slice(0, bytesRead));
            } else {
                this.push(buffer);
            }
        } catch (err) {
            return this.destroy(err);
        }
    }

    public async _destroy(
        error: Error | null,
        callback: (error: Error | null) => void,
    ): Promise<void> {
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
