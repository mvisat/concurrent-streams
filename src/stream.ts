import { close, open, read, write } from 'fs';
import { promisify } from 'util';

import RWLock from 'async-rwlock';
import * as Emittery from 'emittery';

import { ReadStream, ReadStreamOptions } from './read-stream';
import { WriteStream, WriteStreamOptions } from './write-stream';

export interface StreamOptions {
    flags?: string;
    encoding?: string;
    fd?: number;
    mode?: number;
    autoClose?: boolean;
}

export const ErrInvalidRefCount = new Error('invalid ref count');
export const ErrInvalidOffset = new Error('invalid offset');

const defaultOptions: StreamOptions = {
    flags: 'r+',
    encoding: 'utf8',
    fd: -1,
    mode: 0o666,
    autoClose: true,
};

function applyDefaultOptions(options?: StreamOptions): StreamOptions {
    options = { ...defaultOptions, ...options };
    if (typeof options.flags !== 'string') {
        throw new TypeError('"flags" option must be a string');
    }
    if (typeof options.encoding !== 'string') {
        throw new TypeError('"encoding" option must be a string');
    }
    if (typeof options.fd !== 'number' || !isFinite(options.fd)) {
        throw new TypeError('"fd" option must be a finite number');
    }
    if (typeof options.mode !== 'number' || !isFinite(options.mode)) {
        throw new TypeError('"mode" option must be a finite number');
    }
    if (typeof options.autoClose !== 'boolean') {
        throw new TypeError('"autoClose" option must be a boolean');
    }
    return options;
}

export class ConcurrentStream extends Emittery {
    private path: string;
    private flags: string;
    private mode: number;
    private autoClose: boolean;
    private fd: number;
    private refCount = 0;
    private lock = new RWLock();

    constructor(path: string, options?: StreamOptions) {
        super();

        this.path = path;

        options = applyDefaultOptions(options);
        this.flags = options.flags!;
        this.mode = options.mode!;
        this.autoClose = options.autoClose!;
        this.fd = options.fd!;
    }

    public createReadStream(options?: ReadStreamOptions): ReadStream {
        return new ReadStream(this, options);
    }

    public createWriteStream(options?: WriteStreamOptions): WriteStream {
        return new WriteStream(this, options);
    }

    /** @internal */
    public ref(): void {
        this.refCount++;
    }

    /** @internal */
    public unref(): void {
        this.refCount--;
        if (this.refCount < 0) {
            this.emit('error', ErrInvalidRefCount);
            return;
        }
        if (this.refCount > 0 || !this.autoClose) {
            return;
        }

        if (this.fd < 0) {
            this.emit('close');
            return;
        }
        this.close().catch(err => {
            this.emit('error', err);
        });
    }

    /** @internal */
    public async open(): Promise<void> {
        if (this.fd >= 0) {
            return;
        }

        this.fd = await openAsync(this.path, this.flags, this.mode);
        this.emit('open', this.fd);
    }

    /** @internal */
    public async close(): Promise<void> {
        if (this.fd < 0) {
            return;
        }

        await closeAsync(this.fd);
        this.fd = -1;
        this.emit('close');
    }

    /** @internal */
    public async read(buffer: Buffer | Uint8Array, position: number): Promise<number> {
        try {
            await Promise.all([this.lock.readLock(), this.open()]);
            return readAsync(this.fd, buffer, 0, buffer.length, position);
        } finally {
            this.lock.unlock();
        }
    }

    /** @internal */
    public async write(buffer: Buffer | Uint8Array, position: number): Promise<number> {
        try {
            await Promise.all([this.lock.writeLock(), this.open()]);
            return writeAsync(this.fd, buffer, 0, buffer.length, position);
        } finally {
            this.lock.unlock();
        }
    }
}

const openAsync = promisify(open);
const closeAsync = promisify(close);

// workaround for promisified version of `fs.read` and `fs.write`
// sometimes it only returns `bytesRead` or `bytesWritten`
// we don't need the `buffer`, so we can just omit it
async function readAsync(
    fd: number,
    buffer: Buffer | Uint8Array,
    offset: number,
    length: number,
    position: number,
): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        read(fd, buffer, offset, length, position, (err, bytesRead) => {
            if (err) {
                return reject(err);
            }
            resolve(bytesRead);
        });
    });
}

async function writeAsync(
    fd: number,
    buffer: Buffer | Uint8Array,
    offset: number,
    length: number,
    position: number,
): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        write(fd, buffer, offset, length, position, (err, bytesWritten) => {
            if (err) {
                return reject(err);
            }
            resolve(bytesWritten);
        });
    });
}
