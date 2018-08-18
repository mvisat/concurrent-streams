import { EventEmitter } from 'events';
import { close, open, read, write } from 'fs';
import { promisify } from 'util';

import RWLock from 'async-rwlock';

import { ReadStream, ReadStreamOptions } from './read-stream';
import { WriteStream, WriteStreamOptions } from './write-stream';

export interface StreamOptions {
    flags?: string;
    encoding?: string | null;
    fd?: number | null;
    mode?: number;
    autoClose?: boolean;
}

export const ErrInvalidRef = new Error('invalid ref');
export const ErrInvalidOffset = new Error('invalid offset');

const defaultOptions: StreamOptions = {
    flags: 'r',
    encoding: null,
    fd: null,
    mode: 0o666,
    autoClose: true,
};

export class ConcurrentStream extends EventEmitter {
    public fsOpenAsync = promisify(open);
    public fsCloseAsync = promisify(close);

    private path: string;
    private options: StreamOptions;
    private fd: number;

    private refCount = 0;
    private lock = new RWLock();

    constructor(path: string, options?: StreamOptions) {
        super();

        this.path = path;
        this.options = Object.assign({}, defaultOptions, options);
        this.fd = this.options.fd;
    }

    public createReadStream(options?: ReadStreamOptions): ReadStream {
        return new ReadStream(this, options);
    }

    public createWriteStream(options?: WriteStreamOptions): WriteStream {
        return new WriteStream(this, options);
    }

    public ref(): void {
        this.refCount++;
    }

    public unref(): void {
        this.refCount--;

        if (this.refCount > 0) { return; }
        if (this.refCount < 0) {
            this.emit('error', ErrInvalidRef);
            return;
        }

        if (this.options.autoClose) {
            if (typeof this.fd === 'number') {
                this.closeAsync();
            } else {
                this.emit('close');
            }
        }
    }

    public async openAsync() {
        if (typeof this.fd === 'number') {
            return;
        }

        try {
            this.fd = await this.fsOpenAsync(this.path, this.options.flags, this.options.mode);
            this.emit('open', this.fd);
        } catch (err) {
            this.emit('error', err);
        }
    }

    public async closeAsync() {
        if (typeof this.fd !== 'number') {
            return;
        }

        try {
            await this.fsCloseAsync(this.fd);
            this.emit('close');
        } catch (err) {
            this.emit('error', err);
        }
        this.fd = null;
    }

    public async readAsync(
            buffer: Buffer | Uint8Array, offset: number, length: number,
            position: number, cancels?: () => boolean): Promise<number> {
        if (typeof cancels === 'function' && cancels()) {
            return;
        }

        await this.lock.readLock();
        try {
            await this.openAsync();
            return await this.fsReadAsync(this.fd, buffer, offset, length, position);
        } catch (err) {
            this.emit('error', err);
        } finally {
            this.lock.unlock();
        }
    }

    public async writeAsync(
            buffer: Buffer | Uint8Array, offset: number, length: number,
            position: number, cancels?: () => boolean): Promise<number> {
        if (typeof cancels === 'function' && cancels()) {
            return;
        }

        await this.lock.writeLock();
        try {
            await this.openAsync();
            return await this.fsWriteAsync(this.fd, buffer, offset, length, position);
        } catch (err) {
            this.emit('error', err);
        } finally {
            this.lock.unlock();
        }
    }

    // workaround for promisified version of `fs.read` and `fs.write`
    // sometimes it only returns `bytesRead` or `bytesWritten`
    // we don't need the `buffer`, so we can just omit it
    public fsReadAsync(
            fd: number, buffer: Buffer | Uint8Array, offset: number,
            length: number, position: number): Promise<number> {
        return new Promise((resolve, reject) => {
            read(fd, buffer, offset, length, position, (err, bytesRead) => {
                if (err) {
                    return reject(err);
                }
                resolve(bytesRead);
            });
        });
    }

    public fsWriteAsync(
            fd: number, buffer: Buffer | Uint8Array, offset: number,
            length: number, position: number): Promise<number> {
        return new Promise((resolve, reject) => {
            write(fd, buffer, offset, length, position, (err, bytesWritten) => {
                if (err) {
                    return reject(err);
                }
                resolve(bytesWritten);
            });
        });
    }
}
