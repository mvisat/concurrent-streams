import { expect } from '../helpers';
import * as sinon from 'sinon';

import {
    WriteStream,
    WriteStreamOptions,
    ConcurrentStream,
} from '../../src';
import { PassThrough } from 'stream';

describe('write stream tests', function() {
    const path = '/out/path';

    let sandbox: sinon.SinonSandbox;
    let context: ConcurrentStream;
    let stubRef: sinon.SinonStub;
    let stubUnref: sinon.SinonStub;
    let stubWrite: sinon.SinonStub;

    beforeEach(function() {
        sandbox = sinon.createSandbox();
        context = new ConcurrentStream(path);
        stubRef = sandbox.stub(context, 'ref');
        stubUnref = sandbox.stub(context, 'unref');
        stubWrite = sandbox.stub(context, 'write');
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('new()', function() {
        it('encoding must be one of Buffer encoding', function() {
            const options: WriteStreamOptions = {
                encoding: 'notEncoding',
            };
            expect(() => new WriteStream(context, options)).to.throw(TypeError);
        });

        it('start must be a number', function() {
            const options: WriteStreamOptions = {
                start: NaN,
            };
            expect(() => new WriteStream(context, options)).to.throw(TypeError);
        });

        it('start must be finite', function() {
            const options: WriteStreamOptions = {
                start: Infinity
            };
            expect(() => new WriteStream(context, options)).to.throw(TypeError);
        });

        it('start must be >= 0', function() {
            const options: WriteStreamOptions = {
                start: -1
            };
            expect(() => new WriteStream(context, options)).to.throw(RangeError);
        });

        it('refs to context', function() {
            new WriteStream(context);
            expect(stubRef).to.be.calledOnce;
        });
    });

    describe('_write', function() {
        it('writes to source', function(done) {
            const expected = Buffer.from("Hello");
            const stream = new WriteStream(context);
            const source = new PassThrough({ allowHalfOpen: false });

            const actual: Buffer[] = [];
            stubWrite.callsFake(async (buffer, position) => {
                actual.push(buffer);
                return buffer.length;
            });

            source.pipe(stream);
            source.write(expected);
            source.end();

            stream.on('finish', () => {
                expect(expected).to.deep.equal(Buffer.concat(actual));
                done();
            });
        });
    });

    describe('_writev()', function() {
        it('writes to source', function(done) {
            const expected = Buffer.from("Hello");
            const stream = new WriteStream(context);
            const source = new PassThrough({ allowHalfOpen: false });

            const actual: Buffer[] = [];
            stubWrite.callsFake(async (buffer, position) => {
                actual.push(buffer);
                return buffer.length;
            });

            source.pipe(stream);
            stream.cork();
            for (let i = 0; i < expected.length; i++) {
                source.write(expected.slice(i, i + 1));
            }
            stream.uncork();
            source.end();

            stream.on('finish', () => {
                expect(expected).to.deep.equal(Buffer.concat(actual));
                done();
            });
        });
    });

    describe('_actualWrite()', function() {
        it('error occured', function(done) {
            const expected = Buffer.from("Hello");
            const stream = new WriteStream(context);
            const source = new PassThrough({ allowHalfOpen: false });

            const fakeError = new Error('fake error');
            stubWrite.rejects(fakeError);

            source.pipe(stream);
            source.write(expected);
            source.end();

            stream.on('error', (err) => {
                expect(err).to.equal(fakeError);
                done();
            });
        });
    });

    describe('_destroy()', function() {
        it('unrefs from context', function(done) {
            const fakeError = new Error('fake error');
            const stream = new WriteStream(context).on('error', (err) => {
                expect(err).to.equal(fakeError);
                expect(stubUnref).to.be.calledOnce;
                done();
            });
            stream.destroy(fakeError);
        });
    });
});

