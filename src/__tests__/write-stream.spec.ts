import { createHash } from 'crypto';
import { createReadStream, createWriteStream, unlink } from 'fs';
import { promisify } from 'util';

import { createRandomStream } from 'random-readable';
import { tmpNameSync } from 'tmp';

import { ConcurrentStream, ErrInvalidOffset } from '../stream';

const unlinkAsync = promisify(unlink);

const blobSize = 1 * 1024 * 1024;
const blobIn = tmpNameSync();
const blobOut = tmpNameSync();

function expectEqualStream(actualStream, expectedStream, done) {
    expectEqualStreams([actualStream], [expectedStream], done);
}

function expectEqualStreams(actualStreams, expectedStreams, done) {
    async function getHash(stream) {
        return new Promise((resolve, reject) => {
            const hash = createHash('md5').setEncoding('hex');
            stream
                .on('error', reject)
                .pipe(hash).on('finish', () => {
                    resolve(hash.read());
                });
        });
    }

    expect(actualStreams.length).toBe(expectedStreams.length);
    (async () => {
        try {
            const actualHashes = await Promise.all(actualStreams.map(getHash));
            const expectedHashes = await Promise.all(expectedStreams.map(getHash));
            for (const [i, e] of actualHashes.entries()) {
                expect(e).toBe(expectedHashes[i]);
            }
            done();
        } catch (err) {
            done.fail(err);
        }
    })();
}

describe('Write stream tests', () => {
    const writeError = new Error('Mock write error');

    beforeAll(done => {
        jest.setTimeout(1000);
        createRandomStream(blobSize)
            .on('end', done)
            .pipe(createWriteStream(blobIn));
    });

    afterAll(async done => {
        try {
            await unlinkAsync(blobIn);
            await unlinkAsync(blobOut);
        } catch (err) {
        }
        done();
    });

    beforeEach(async done => {
        try {
            await unlinkAsync(blobOut);
        } catch (err) {
        }
        done();
    });

    afterEach(done => {
        jest.clearAllMocks();
        done();
    });

    it('throws error when invalid option is given', done => {
        const concurrent = new ConcurrentStream(blobOut);
        expect(() => { concurrent.createWriteStream({ start: NaN }); }).toThrow();
        expect(() => { concurrent.createWriteStream({ start: -1 }); }).toThrow();
        expect(() => { concurrent.createWriteStream({ end: NaN }); }).toThrow();
        expect(() => { concurrent.createWriteStream({ end: -1 }); }).toThrow();
        expect(() => { concurrent.createWriteStream({ start: 10, end: 0 }); }).toThrow();
        done();
    });

    it('writes file', done => {
        const concurrent = new ConcurrentStream(blobOut, { flags: 'w' })
            .on('error', done.fail)
            .on('close', () => {
                expectEqualStream(
                    createReadStream(blobIn),
                    createReadStream(blobOut),
                    done);
            });
        createReadStream(blobIn).pipe(concurrent.createWriteStream());
    });

    it('writes 4 chunks simultaneously', async done => {
        const concurrent = new ConcurrentStream(blobOut, { flags: 'w' })
            .on('error', done.fail)
            .on('close', () => {
                expectEqualStream(
                    createReadStream(blobIn),
                    createReadStream(blobOut),
                    done);
            });
        const actualStreams = [];
        const inStreams = [];
        const N = 4;
        for (let i = 0; i < N; ++i) {
            const start = blobSize * i / 4;
            const end = blobSize * (i + 1) / 4;
            actualStreams.push(concurrent.createWriteStream({ start }));
            inStreams.push(createReadStream(blobIn, { start, end }));
        }
        await Promise.all(inStreams.map((stream, index) => {
            return new Promise((resolve, reject) => {
                stream.pipe(actualStreams[index]);
                resolve();
            });
        }));
    });

    it('writes buffered chunks', done => {
        const concurrent = new ConcurrentStream(blobOut, { flags: 'w' });
        const stream = concurrent.createWriteStream();
        const mockWritev = jest.spyOn(stream, "_writev");
        expect.assertions(1);
        stream.on('error', done.fail);
        concurrent
            .on('error', done.fail)
            .on('close', () => {
                expect(mockWritev).toHaveBeenCalledTimes(1);
                done();
            });

        const buf = Buffer.from([0]);
        stream.cork();
        for (let i = 0; i < 100; ++i) {
            stream.write('a', 'utf8');
            stream.write(buf);
        }
        stream.end();
        process.nextTick(() => { stream.uncork(); });
    });

    it('emits error when end offset exceeded', done => {
        expect.assertions(1);
        new ConcurrentStream(blobOut, { flags: 'w' })
            .on('error', done.fail)
            .createWriteStream({ start: 0, end: 100 })
            .on('error', err => {
                expect(() => { throw err; }).toThrowError(ErrInvalidOffset);
            })
            .on('finish', done)
            .end(Buffer.alloc(101));
    });

    it('emits error when end offset exceeded and start is a positive number', done => {
        expect.assertions(1);
        new ConcurrentStream(blobOut, { flags: 'w' })
            .on('error', done.fail)
            .createWriteStream({ start: 1, end: 100 })
            .on('error', err => {
                expect(() => { throw err; }).toThrowError(ErrInvalidOffset);
            })
            .on('finish', done)
            .end(Buffer.alloc(100));
    });

    it('does not emit error when end offset not exceeded', done => {
        new ConcurrentStream(blobOut, { flags: 'w' })
            .on('error', done.fail)
            .createWriteStream({ start: 0, end: 100 })
            .on('error', done.fail)
            .on('finish', done)
            .end(Buffer.alloc(100));
    });

    it('emits progress event', done => {
        let prevBytesWritten = 0;
        const concurrent = new ConcurrentStream(blobOut, { flags: 'w' })
            .on('error', done.fail)
            .on('close', done);
        const stream = concurrent
            .createWriteStream()
            .on('progress', bytesWritten => {
                expect(bytesWritten).toBeGreaterThan(prevBytesWritten);
                prevBytesWritten = bytesWritten;
            })
            .on('error', done.fail);

        expect.hasAssertions();
        createRandomStream(1).pipe(stream);
    });

    it('unrefs when destroyed', done => {
        const concurrent = new ConcurrentStream(blobOut, { flags: 'w' })
            .on('error', done.fail)
            .on('close', done);
        const stream = concurrent.createWriteStream()
            .on('error', done.fail)
            .on('progress', bytesWritten => {
                expect(bytesWritten).toBeGreaterThan(0);
                stream.destroy();
            });

        expect.hasAssertions();
        createRandomStream(blobSize).pipe(stream);
    });

    it('unrefs when write error occured', done => {
        const concurrent = new ConcurrentStream(blobOut, { flags: 'w' })
            .on('error', done.fail)
            .on('close', done);

        const writeMock = jest.spyOn(concurrent, 'writeAsync');
        writeMock.mockRejectedValue(writeError);
        expect.assertions(1);

        createRandomStream(blobSize)
            .pipe(concurrent.createWriteStream()
                .on('error', err => {
                    expect(() => { throw err; }).toThrowError(writeError);
                }));
    });

    it('unrefs when fs.write error occured', done => {
        const concurrent = new ConcurrentStream(blobOut, { flags: 'w' })
            .on('error', done.fail)
            .on('close', done);

        const fs = require('fs');
        const writeMock = jest.spyOn(fs, 'write');
        writeMock.mockImplementationOnce((fd, buf, offset, length, pos, cb) => {
            cb(writeError);
        });
        expect.assertions(1);

        createRandomStream(blobSize)
            .pipe(concurrent.createWriteStream()
                .on('error', err => {
                    expect(() => { throw err; }).toThrowError(writeError);
                }));
    });
});
