import { createHash } from 'crypto';
import * as fs from 'fs';
import { createReadStream, createWriteStream, unlink } from 'fs';
import { promisify } from 'util';

import { NullWritable } from 'null-writable';
import { createRandomStream } from 'random-readable';
import { tmpNameSync } from 'tmp';

import { ConcurrentStream } from '../stream';
import { ReadStream } from '../read-stream';

const unlinkAsync = promisify(unlink);

const blobSize = 1 * 1024 * 1024;
const blobIn = tmpNameSync();
const blobOut = tmpNameSync();

function expectEqualStream(
        actualStream: ReadStream | fs.ReadStream,
        expectedStream: ReadStream | fs.ReadStream,
        done: jest.DoneCallback) {
    expectEqualStreams([actualStream], [expectedStream], done);
}

function expectEqualStreams(
        actualStreams: Array<ReadStream | fs.ReadStream>,
        expectedStreams: Array<ReadStream | fs.ReadStream>,
        done: jest.DoneCallback) {
    async function getHash(stream: ReadStream | fs.ReadStream) {
        return new Promise<string | Buffer>((resolve, reject) => {
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
    let concurrent: ConcurrentStream;
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

    it('throws error when invalid option is given', done => {
        expect(() => { concurrent.createReadStream({ start: NaN }); }).toThrow();
        expect(() => { concurrent.createReadStream({ start: -1 }); }).toThrow();
        expect(() => { concurrent.createReadStream({ end: NaN }); }).toThrow();
        expect(() => { concurrent.createReadStream({ end: -1 }); }).toThrow();
        expect(() => { concurrent.createReadStream({ start: 10, end: 0 }); }).toThrow();
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
        const actualStreams: Array<ReadStream> = [];
        const expectedStreams: Array<ReadStream> = [];
        const N = 4;
        for (let i = 0; i < N; ++i) {
            const opt = { start: blobSize * i / N, end: blobSize * (i + 1) / N };
            actualStreams.push(concurrent.createReadStream(opt));
            expectedStreams.push(concurrent.createReadStream(opt));
        }
        expectEqualStreams(actualStreams, expectedStreams, done);
    });

    it('reads file with offset', done => {
        concurrent.on('error', done.fail);
        const opts = { start: 10, end: 100 };
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
