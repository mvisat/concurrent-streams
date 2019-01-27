import { expect } from '../helpers';
import * as sinon from 'sinon';

import { PassThrough } from 'stream';

import {
    ReadStream,
    ReadStreamOptions,
    ConcurrentStream,
} from '../../src';

describe('read stream tests', function() {
    this.timeout(100);
    const path = '/out/path';

    let sandbox: sinon.SinonSandbox;
    let context: ConcurrentStream;
    let stubRef: sinon.SinonStub;
    let stubUnref: sinon.SinonStub;
    let stubRead: sinon.SinonStub;

    beforeEach(function() {
        sandbox = sinon.createSandbox();
        context = new ConcurrentStream(path);
        stubRef = sandbox.stub(context, 'ref');
        stubUnref = sandbox.stub(context, 'unref');
        stubRead = sandbox.stub(context, 'read');
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('new()', function() {
        it('start must be a number', function() {
            const options: ReadStreamOptions = {
                start: NaN,
            };
            expect(() => new ReadStream(context, options)).to.throw(TypeError);
        });

        it('start must be finite', function() {
            const options: ReadStreamOptions = {
                start: Infinity
            };
            expect(() => new ReadStream(context, options)).to.throw(TypeError);
        });

        it('start must be >= 0', function() {
            const options: ReadStreamOptions = {
                start: -1
            };
            expect(() => new ReadStream(context, options)).to.throw(TypeError);
        });

        it('end must be a number', function() {
            const options: ReadStreamOptions = {
                end: NaN,
            };
            expect(() => new ReadStream(context, options)).to.throw(TypeError);
        });

        it('end must be >= 0', function() {
            const options: ReadStreamOptions = {
                end: -1
            };
            expect(() => new ReadStream(context, options)).to.throw(TypeError);
        });

        it('highWaterMark must be a number', function() {
            const options: ReadStreamOptions = {
                highWaterMark: NaN,
            };
            expect(() => new ReadStream(context, options)).to.throw(TypeError);
        });

        it('highWaterMark must be finite', function() {
            const options: ReadStreamOptions = {
                highWaterMark: Infinity
            };
            expect(() => new ReadStream(context, options)).to.throw(TypeError);
        });

        it('highWaterMark must be >= 0', function() {
            const options: ReadStreamOptions = {
                highWaterMark: -1
            };
            expect(() => new ReadStream(context, options)).to.throw(TypeError);
        });

        it('start must be <= end', function() {
            const options: ReadStreamOptions = {
                start: 101,
                end: 100,
            };
            expect(() => new ReadStream(context, options)).to.throw(RangeError);
        });

        it('refs to context', function() {
            new ReadStream(context);
            expect(stubRef).to.be.calledOnce;
        });
    });

    describe('_read()', function() {
        it('reads from source', function(done) {
            // use source with odd size and high water mark with even number
            // to test available data < highWaterMark condition
            const expected = Buffer.from("Hello");
            const options: ReadStreamOptions = {
                highWaterMark: 2,
            };
            stubRead.callsFake(async (buffer: Buffer, position: number): Promise<number> => {
                if (position >= expected.length) {
                    return 0;
                }
                return expected.copy(buffer, 0, position, position + options.highWaterMark!);
            });

            const actual: Buffer[] = [];
            const stream = new ReadStream(context, options).on('data', (data) => {
                actual.push(data);
            });
            const sink = new PassThrough({ allowHalfOpen: false }).on('finish', () => {
                expect(expected).to.deep.equal(Buffer.concat(actual));
                done();
            });
            stream.pipe(sink);
        });

        it('emits "read" written', function(done) {
            const expected = Buffer.allocUnsafe(123);
            const options: ReadStreamOptions = {
                highWaterMark: 2,
            };
            stubRead.callsFake(async (buffer: Buffer, position: number): Promise<number> => {
                if (position >= expected.length) {
                    return 0;
                }
                return expected.copy(buffer, 0, position, position + options.highWaterMark!);
            });

            let actual = 0;
            const stream = new ReadStream(context, options).on('read', (read) => {
                actual += read;
            });
            const sink = new PassThrough({ allowHalfOpen: false }).on('finish', () => {
                expect(expected.length).to.equal(actual);
                done();
            });
            stream.pipe(sink);
        });

        it('size to read <= 0', function(done) {
            const expected = Buffer.from("Hello");
            const options: ReadStreamOptions = {
                start: 0,
                end: 5,
                highWaterMark: 2,
            };
            stubRead.callsFake(async (buffer: Buffer, position: number): Promise<number> => {
                if (position >= expected.length) {
                    return 0;
                }
                return expected.copy(buffer, 0, position, position + options.highWaterMark!);
            });

            const actual: Buffer[] = [];
            const stream = new ReadStream(context, options).on('data', (data) => {
                actual.push(data);
            });
            const sink = new PassThrough({ allowHalfOpen: false }).on('finish', () => {
                expect(expected).to.deep.equal(Buffer.concat(actual));
                done();
            });
            stream.pipe(sink);
        });

        it('error occured', function(done) {
            const fakeError = new Error('fake error');
            stubRead.rejects(fakeError);
            const stream = new ReadStream(context).on('error', (err) => {
                expect(spyDestroy).to.be.calledOnceWithExactly(err);
                done();
            });
            const spyDestroy = sandbox.spy(stream, 'destroy');
            stream.pipe(new PassThrough({ allowHalfOpen: false }));
        });
    });

    describe('_destroy()', function() {
        it('unrefs from context', function(done) {
            const fakeError = new Error('fake error');
            const stream = new ReadStream(context).on('error', (err) => {
                expect(err).to.equal(fakeError);
                expect(stubUnref).to.be.calledOnce;
                done();
            });
            stream.destroy(fakeError);
        });
    });
});
