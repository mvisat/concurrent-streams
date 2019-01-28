import { expect } from '../helpers';
import * as sinon from 'sinon';
import * as proxyquire from 'proxyquire';

import {
    ConcurrentStream,
    StreamOptions,
    ErrInvalidRefCount
} from '../../src';

describe('concurrent stream tests', function() {
    const path = '/out/path';

    let sandbox: sinon.SinonSandbox;
    let stubReadStream: sinon.SinonStub;
    let stubWriteStream: sinon.SinonStub;
    let stubFsOpen: sinon.SinonStub;
    let stubFsClose: sinon.SinonStub;
    let stubFsRead: sinon.SinonStub;
    let stubFsWrite: sinon.SinonStub;
    let Proxied: typeof import('../../src/stream');

    beforeEach(function() {
        sandbox = sinon.createSandbox();
        stubReadStream = sandbox.stub();
        stubWriteStream = sandbox.stub();
        stubFsOpen = sandbox.stub();
        stubFsClose = sandbox.stub();
        stubFsRead = sandbox.stub();
        stubFsWrite = sandbox.stub();
        Proxied = proxyquire.noCallThru().load('../../src/stream', {
            './read-stream': {
                ReadStream: stubReadStream,
            },
            './write-stream': {
                WriteStream: stubWriteStream,
            },
            fs: {
                open: stubFsOpen,
                close: stubFsClose,
                read: stubFsRead,
                write: stubFsWrite,
            }
        });
    });

    afterEach(function() {
        sandbox.restore();
    });

    describe('new()', function() {
        it('flags must be a string', function() {
            const options: StreamOptions = {
                flags: undefined
            };
            expect(() => new ConcurrentStream(path, options)).to.throw(TypeError);
        });

        it('encoding must be a string', function() {
            const options: StreamOptions = {
                encoding: undefined
            };
            expect(() => new ConcurrentStream(path, options)).to.throw(TypeError);
        });

        it('fd must be a number', function() {
            const options: StreamOptions = {
                fd: NaN
            };
            expect(() => new ConcurrentStream(path, options)).to.throw(TypeError);
        });

        it('fd must be finite', function() {
            const options: StreamOptions = {
                fd: Infinity
            };
            expect(() => new ConcurrentStream(path, options)).to.throw(TypeError);
        });

        it('mode must be a number', function() {
            const options: StreamOptions = {
                mode: NaN
            };
            expect(() => new ConcurrentStream(path, options)).to.throw(TypeError);
        });

        it('mode must be finite', function() {
            const options: StreamOptions = {
                mode: Infinity
            };
            expect(() => new ConcurrentStream(path, options)).to.throw(TypeError);
        });

        it('autoClose must be a boolean', function() {
            const options: StreamOptions = {
                autoClose: undefined
            };
            expect(() => new ConcurrentStream(path, options)).to.throw(TypeError);
        });
    });

    describe('createReadStream()', function() {
        it('creates write stream', function() {
            const stream = new Proxied.ConcurrentStream(path);
            stream.createReadStream();
            expect(stubReadStream).to.be.calledWithNew;
        });
    });

    describe('createWriteStream()', function() {
        it('creates write stream', function() {
            const stream = new Proxied.ConcurrentStream(path);
            stream.createWriteStream();
            expect(stubWriteStream).to.be.calledWithNew;
        });
    });

    describe('ref()', function() {
        it('refs', function() {
            const stream = new ConcurrentStream(path);
            const spyEmit = sandbox.spy(stream, 'emit');
            stream.ref();
            expect(spyEmit).not.to.have.been.calledWith('error');
        });
    });

    describe('unref()', function() {
        it('unrefs', function() {
            const stream = new ConcurrentStream(path);
            const spyEmit = sandbox.spy(stream, 'emit');
            stream.ref();
            stream.unref();
            expect(spyEmit).not.to.have.been.calledWith('error');
        });

        it('negative ref count', function(done) {
            const stream = new ConcurrentStream(path);
            stream.on('error', function(err) {
                expect(err).to.equal(ErrInvalidRefCount);
                done();
            });
            stream.unref();
        });

        describe('autoClose', function() {
            it('auto closes', function(done) {
                const options: StreamOptions = {
                    autoClose: true,
                };
                const stream = new ConcurrentStream(path, options);
                stream.on('close', done);
                stream.ref();
                stream.unref();
            });

            it('fd is set', function() {
                const options: StreamOptions = {
                    autoClose: true,
                    fd: 10,
                };
                const stream = new ConcurrentStream(path, options);
                const stubClose = sandbox.stub(stream, 'close').resolves();
                stream.ref();
                stream.unref();
                expect(stubClose).to.be.calledOnce;
            });

            it('error occured', function(done) {
                const fakeError = new Error('fake error');
                const options: StreamOptions = {
                    autoClose: true,
                    fd: 10,
                };
                const stream = new ConcurrentStream(path, options);
                const stubClose = sandbox.stub(stream, 'close').rejects(fakeError);
                stream.on('error', (err) => {
                    expect(err).to.equal(fakeError);
                    expect(stubClose).to.be.calledOnce;
                    done();
                });
                stream.ref();
                stream.unref();
            });

            it('ref count > 0', function() {
                const options: StreamOptions = {
                    autoClose: true,
                    fd: 10,
                };
                const stream = new ConcurrentStream(path, options);
                const stubClose = sandbox.stub(stream, 'close').resolves();
                stream.ref();
                stream.ref();
                stream.unref();
                expect(stubClose).not.to.have.been.called;
            });

            it('autoClose is false', function() {
                const options: StreamOptions = {
                    autoClose: false,
                    fd: 10,
                };
                const stream = new ConcurrentStream(path, options);
                const stubClose = sandbox.stub(stream, 'close').resolves();
                stream.ref();
                stream.unref();
                expect(stubClose).not.to.have.been.called;
            });

        });
    });

    describe('open()', function() {
        it('opens path as fd', function(done) {
            const fd = 10;
            stubFsOpen.yields(null, fd);
            const stream = new Proxied.ConcurrentStream(path);
            stream.on('open', (openedFd) => {
                expect(openedFd).to.equal(fd);
                done();
            });
            stream.open();
        });

        it('fd already opened', async function() {
            const options: StreamOptions = {
                fd: 10,
            };
            const stream = new Proxied.ConcurrentStream(path, options);
            await stream.open();
            expect(stubFsOpen).not.to.have.been.called;
        });
    });

    describe('close()', function() {
        it('closes fd', function(done) {
            stubFsClose.yields(null);
            const options: StreamOptions = {
                fd: 10,
            };
            const stream = new Proxied.ConcurrentStream(path, options);
            stream.on('close', () => {
                done();
            });
            stream.close();
        });

        it('fd not opened', async function() {
            stubFsClose.yields(null);
            const options: StreamOptions = {
                fd: -1,
            };
            const stream = new Proxied.ConcurrentStream(path, options);
            await stream.close();
            expect(stubFsClose).not.to.have.been.called;
        });
    });

    describe('read()', function() {
        const buffer = Buffer.allocUnsafe(1024);

        it('reads from fd', async function() {
            stubFsRead.yields(null, buffer.length, buffer);
            const options: StreamOptions = {
                fd: 10,
            };
            const stream = new Proxied.ConcurrentStream(path, options);
            expect(await stream.read(buffer, 0, buffer.length, 0)).to.equal(buffer.length);
        });

        it('emits "read" event', function(done) {
            stubFsRead.yields(null, buffer.length, buffer);
            const position = 5;
            const options: StreamOptions = {
                fd: 10,
            };
            const stream = new Proxied.ConcurrentStream(path, options);
            stream.on('read', ([readBuffer, readPosition]) => {
                expect(readBuffer).to.deep.equal(buffer);
                expect(readPosition).to.equal(position);
                done();
            });
            stream.read(buffer, 0, buffer.length, position);
        });

        it('error occured', async function() {
            const fakeError = new Error('fake error');
            stubFsRead.yields(fakeError);
            const options: StreamOptions = {
                fd: 10,
            };
            const stream = new Proxied.ConcurrentStream(path, options);
            expect(stream.read(buffer, 0, buffer.length, 0)).to.be.rejectedWith(fakeError);
        });

        it('calls open() if pending', async function() {
            stubFsRead.yields(null, buffer.length, buffer);
            const stream = new Proxied.ConcurrentStream(path);
            const stubOpen = sandbox.stub(stream, 'open').resolves();
            await stream.read(buffer, 0, buffer.length, 0);
            expect(stubOpen).to.be.calledOnce;
        });
    });

    describe('write()', function() {
        const buffer = Buffer.allocUnsafe(1024);

        it('writes to fd', async function() {
            stubFsWrite.yields(null, buffer.length, buffer);
            const options: StreamOptions = {
                fd: 10,
            };
            const stream = new Proxied.ConcurrentStream(path, options);
            expect(await stream.write(buffer, 0, buffer.length, 0)).to.equal(buffer.length);
        });

        it('emits "written" event', function(done) {
            stubFsWrite.yields(null, buffer.length, buffer);
            const position = 5;
            const options: StreamOptions = {
                fd: 10,
            };
            const stream = new Proxied.ConcurrentStream(path, options);
            stream.on('written', ([writtenBuffer, writtenPosition]) => {
                expect(writtenBuffer).to.deep.equal(buffer);
                expect(writtenPosition).to.equal(position);
                done();
            });
            stream.write(buffer, 0, buffer.length, position);
        });


        it('error occured', async function() {
            const fakeError = new Error('fake error');
            stubFsWrite.yields(fakeError);
            const options: StreamOptions = {
                fd: 10,
            };
            const stream = new Proxied.ConcurrentStream(path, options);
            expect(stream.write(buffer, 0, buffer.length, 0)).to.be.rejectedWith(fakeError);
        });

        it('calls open() if pending', async function() {
            stubFsWrite.yields(null, buffer.length, buffer);
            const stream = new Proxied.ConcurrentStream(path);
            const stubOpen = sandbox.stub(stream, 'open').resolves();
            await stream.write(buffer, 0, buffer.length, 0);
            expect(stubOpen).to.be.calledOnce;
        });
    });
});
