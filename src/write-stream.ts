import { Writable } from 'stream';

import { ConcurrentStream, ErrInvalidOffset } from './stream';

export interface WriteStreamOptions {
    start?: number;
    end?: number;
    highWaterMark?: number;
}

const defaultOptions: WriteStreamOptions = {
    start: 0,
    end: Infinity,
    highWaterMark: 64 * 1024,
};

function validateOptions(options: WriteStreamOptions) {
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

export class WriteStream extends Writable {
    private context: ConcurrentStream;
    private options: WriteStreamOptions;
    private pos: number;
    private bytesWritten: number;
    private closed: boolean;

    constructor(context: ConcurrentStream, options?: WriteStreamOptions) {
        options = Object.assign({}, defaultOptions, options);
        validateOptions(options);
        super(options);

        this.context = context;
        this.context.ref();
        this.options = options;

        this.pos = options.start!;
        this.bytesWritten = 0;
        this.closed = false;
    }

    public _write(buffer: Buffer | Uint8Array, encoding: string, callback: (error?: Error) => void): void {
        this._actualWrite(buffer, callback);
    }

    public _writev(buffers: Array<{chunk: any, encoding: string}>, callback: (error?: Error) => void): void {
        const buffer = Buffer.concat(buffers.map(b => b.chunk));
        this._actualWrite(buffer, callback);
    }

    public _final(callback: (error?: Error) => void): void {
        this._close();
        callback();
    }

    public _destroy(error: Error | null, callback: (error: Error | null) => void): void {
        this._close();
        callback(error);
    }

    private _close(): void {
        if (this.closed) {
            return;
        }

        this.closed = true;
        this.context.unref();
    }

    private _actualWrite(buffer: Buffer | Uint8Array, callback: (error?: Error) => void): void {
        /* istanbul ignore if */
        if (this.closed) {
            return;
        }

        if (this.pos + buffer.length > this.options.end!) {
            this._close();
            callback(ErrInvalidOffset);
            return;
        }

        (async () => {
            try {
                const bytesWritten = await this.context.writeAsync(
                    buffer, 0, buffer.length, this.pos, () => this.closed);
                this.pos += bytesWritten;
                this.bytesWritten += bytesWritten;
                this.emit('progress', this.bytesWritten);
                callback();
            } catch (err) {
                this._close();
                callback(err);
            }
        })();
    }
}
