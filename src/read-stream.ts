import { Readable } from 'stream';

import { ConcurrentStream } from './stream';

export interface ReadStreamOptions {
    start?: number;
    end?: number;
    highWaterMark?: number;
}

const defaultOptions: ReadStreamOptions = {
    start: 0,
    end: Infinity,
    highWaterMark: 64 * 1024,
};

function validateOptions(options: ReadStreamOptions) {
    if (typeof options.start !== 'number' || isNaN(options.start)) {
        throw new TypeError('"start" option must be a number');
    }
    if (typeof options.end !== 'number' || isNaN(options.end)) {
        throw new TypeError('"end" option must be a number');
    }
    if (options.start < 0 || options.end < 0) {
        throw new Error('"start" and "end" option must be >= 0');
    }
    if (options.start > options.end) {
        throw new Error('"start" option must be <= "end" option');
    }
}

export class ReadStream extends Readable {
    private context: ConcurrentStream;
    private options: ReadStreamOptions;
    private pos: number;
    private closed: boolean;

    constructor(context: ConcurrentStream, options?: ReadStreamOptions) {
        options = Object.assign({}, defaultOptions, options);
        validateOptions(options);
        super(options);

        this.context = context;
        this.context.ref();
        this.options = options;

        this.pos = options.start!;
        this.closed = false;
    }

    public _read(size: number): void {
        if (this.closed) {
            return;
        }

        const waterMark = this.readableHighWaterMark;
        let toRead = Math.min(waterMark, size);
        if (typeof this.options.end === 'number' && this.options.end !== Infinity) {
            toRead = Math.min(toRead, this.options.end - this.pos + 1);
        }
        if (toRead <= 0) {
            this.push(null);
            this._close();
            return;
        }

        (async () => {
            const buf = Buffer.allocUnsafe(toRead);
            try {
                const bytesRead = await this.context.readAsync(
                    buf, 0, toRead, this.pos, () => this.closed);
                if (!bytesRead) {
                    this.push(null);
                    this._close();
                    return;
                }
                this.pos += bytesRead;
                this.push(buf.slice(0, bytesRead));
            } catch (err) {
                this.destroy(err);
            }
        })();
    }

    public _destroy(error: Error | null, callback: (error: Error | null) => void): void {
        this._close();
        callback(error);
    }

    private _close(): void {
        /* istanbul ignore if */
        if (this.closed) {
            return;
        }

        this.closed = true;
        this.context.unref();
    }
}
