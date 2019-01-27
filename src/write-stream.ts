import { Writable } from 'stream';

import { ConcurrentStream, ErrInvalidOffset } from './stream';
import { applyDefaultOptions } from './util';

export interface WriteStreamOptions {
    start?: number;
    end?: number;
    highWaterMark?: number;
}

export class WriteStream extends Writable {
    private context: ConcurrentStream;
    private current: number;
    private endOffset: number;
    private closed = false;

    constructor(context: ConcurrentStream, options?: WriteStreamOptions) {
        super(options);

        this.context = context;
        this.context.ref();

        options = applyDefaultOptions(options);
        this.current = options.start!;
        this.endOffset = options.end!;
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
        if (this.current + buffer.length > this.endOffset) {
            await this._close();
            return callback(ErrInvalidOffset);
        }

        try {
            const bytesWritten = await this.context.write(buffer, this.current);
            this.current += bytesWritten;
            this.emit('written', bytesWritten);
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
