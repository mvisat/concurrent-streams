import { Writable } from 'stream';

import { ConcurrentStream } from './stream';

export interface WriteStreamOptions {
    encoding?: string;
    start?: number;
}

const defaultOptions: WriteStreamOptions = {
    encoding: 'utf8',
    start: 0,
};

function applyDefaultOptions(options?: WriteStreamOptions): WriteStreamOptions {
    options = { ...defaultOptions, ...options };
    if (typeof options.encoding !== 'string' || !Buffer.isEncoding(options.encoding)) {
        throw new TypeError('"encoding" option must be one of Buffer encoding');
    }
    if (typeof options.start !== 'number' || !isFinite(options.start)) {
        throw new TypeError('"start" option must be a number');
    }
    if (options.start < 0) {
        throw new RangeError('"start" option must be >= 0');
    }
    return options;
}

export class WriteStream extends Writable {
    private context: ConcurrentStream;
    private current: number;
    private closed = false;

    constructor(context: ConcurrentStream, options?: WriteStreamOptions) {
        super();

        this.context = context;
        this.context.ref();

        options = applyDefaultOptions(options);
        this.setDefaultEncoding(options.encoding!);
        this.current = options.start!;
    }

    public get position(): number {
        return this.current;
    }

    public async _write(
        buffer: Buffer | Uint8Array,
        encoding: string,
        callback: (error?: Error) => void,
    ): Promise<void> {
        return this._actualWrite(buffer, callback);
    }

    public async _writev(
        buffers: Array<{ chunk: any; encoding: string }>,
        callback: (error?: Error) => void,
    ): Promise<void> {
        const buffer = Buffer.concat(buffers.map(buf => buf.chunk));
        return this._actualWrite(buffer, callback);
    }

    public async _final(callback: (error?: Error) => void): Promise<void> {
        await this._close();
        callback();
    }

    public async _destroy(
        error: Error | null,
        callback: (error: Error | null) => void,
    ): Promise<void> {
        await this._close();
        this.end();
        callback(error);
    }

    private async _actualWrite(
        buffer: Buffer | Uint8Array,
        callback: (error?: Error) => void,
    ): Promise<void> {
        try {
            const bytesWritten = await this.context.write(buffer, 0, buffer.length, this.current);
            this.current += bytesWritten;
            callback();
        } catch (err) {
            await this._close();
            callback(err);
        }
    }

    private async _close(): Promise<void> {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.context.unref();
    }
}
