import { createHash } from 'crypto';
import { createReadStream, createWriteStream, unlink } from 'fs';
import { promisify } from 'util';

import { NullWritable } from 'null-writable';
import { createRandomStream } from 'random-readable';
import { tmpNameSync } from 'tmp';

import { ConcurrentStream } from '../stream';

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

describe('Read stream tests', () => {
    let concurrent;
    const readError = new Error('Mock read error');

    beforeAll(done => {
        concurrent = new ConcurrentStream(blobIn);
        createRandomStream(blobSize)
            .on('error', done.fail)
            .on('end', done)
            .pipe(createWriteStream(blobIn));
    });

    afterAll(async done => {
        try { await unlinkAsync(blobIn); } catch (err) { }
        try { await unlinkAsync(blobOut); } catch (err) { }
        done();
    });

    beforeEach(async done => {
        try { await unlinkAsync(blobOut); } catch (err) { }
        done();
    });

    afterEach(done => {
        jest.clearAllMocks();
        done();
    });

    it('reads file', done => {
        concurrent.on('error', done.fail);
        const actualStream = concurrent.createReadStream();
        const expectedStream = createReadStream(blobIn);
        expectEqualStream(actualStream, expectedStream, done);
    });

    it('reads 4 chunks simultaneously', done => {
        concurrent.on('error', done.fail);
        const actualStreams = [];
        const expectedStreams = [];
        const N = 4;
        for (let i = 0; i < N; ++i) {
            const opt = { start: blobSize * i / N, end: blobSize * (i + 1) / N };
            actualStreams.push(concurrent.createReadStream(opt));
            expectedStreams.push(concurrent.createReadStream(opt));
        }
        expectEqualStreams(actualStreams, expectedStreams, done);
    });

    it('reads file with start offset', done => {
        concurrent.on('error', done.fail);
        const opts = { start: 1 };
        const actualStream = concurrent.createReadStream(opts);
        const expectedStream = createReadStream(blobIn, opts);
        expectEqualStream(actualStream, expectedStream, done);
    });

    it('unrefs when destroyed', done => {
        concurrent
            .on('error', done.fail)
            .on('close', done);
        const stream = concurrent.createReadStream();
        stream
            .on('error', done.fail)
            .pipe(new NullWritable());
        stream.destroy();
    });

    it('unrefs when read error occured', done => {
        concurrent
            .on('error', done.fail)
            .on('close', done);
        const stream = concurrent.createReadStream();
        stream.on('error', err => {
            expect(() => { throw err; }).toThrowError(readError);
        });
        expect.assertions(1);

        const readMock = jest.spyOn(concurrent, 'fsReadAsync');
        readMock.mockRejectedValueOnce(readError);
        stream.pipe(new NullWritable());
    });

    it('unrefs when fs.read error occured', done => {
        concurrent.on('error', done.fail);
        concurrent.on('close', done);

        const stream = concurrent.createReadStream();
        stream.on('error', err => {
            expect(() => { throw err; }).toThrowError(readError);
        });
        expect.assertions(1);

        const fs = require('fs');
        const readMock = jest.spyOn(fs, 'read');
        readMock.mockImplementationOnce((fd, buf, offset, length, pos, cb) => {
            cb(readError);
        });
        stream.pipe(new NullWritable());
    });
});
