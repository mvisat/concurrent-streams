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

export class ReadStream extends Readable {
    private context: ConcurrentStream;
    private options: ReadStreamOptions;
    private pos: number;
    private closed: boolean;

    constructor(context: ConcurrentStream, options: ReadStreamOptions) {
        options = Object.assign({}, defaultOptions, options);
        super(options);

        this.context = context;
        this.context.ref();
        this.options = options;

        this.pos = this.options.start;
        this.closed = false;
    }

    public _read(size: number): void {
        if (this.closed) {
            return;
        }

        // TODO: fix this with `this.readableHighWaterMark` when using Node 9+
        // @ts-ignore
        const waterMark = this._readableState.highWaterMark;

        let toRead = Math.min(waterMark, size);
        if (this.options.end >= 0) {
            toRead = Math.min(toRead, this.options.end - this.pos);
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

    public _destroy(error: Error, callback: (error?: Error) => void): void {
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
