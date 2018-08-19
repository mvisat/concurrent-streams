import { tmpNameSync } from 'tmp';

import {
    ConcurrentStream,
    ErrInvalidRef,
} from '../stream';

const blobSize = 1 * 1024 * 1024;
const blobIn = tmpNameSync();
const blobOut = tmpNameSync();

describe('Concurrent stream tests', () => {
    let concurrent;
    let fsOpenMock;
    let fsCloseMock;
    let fsReadMock;
    let fsWriteMock;
    const openError = new Error('Mock open error');
    const closeError = new Error('Mock close error');
    const readError = new Error('Mock read error');
    const writeError = new Error('Mock open error');
    const dummy = Buffer.alloc(100);

    beforeEach(() => {
        concurrent = new ConcurrentStream(blobIn);
        fsOpenMock = jest.spyOn(concurrent, 'fsOpenAsync');
        fsCloseMock = jest.spyOn(concurrent, 'fsCloseAsync');
        fsReadMock = jest.spyOn(concurrent, 'fsReadAsync');
        fsWriteMock = jest.spyOn(concurrent, 'fsWriteAsync');
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('emits error on invalid ref', done => {
        concurrent.on('error', err => {
            expect(() => { throw err; }).toThrowError(ErrInvalidRef);
            done();
        }).unref();
    });

    it('emits open when fd is opened', async done => {
        concurrent.on('error', done.fail);
        concurrent.on('open', fd => {
            expect(fd).toBe(0);
            done();
        });
        fsOpenMock.mockResolvedValue(0);
        await concurrent.openAsync();
    });

    it('emits close when autoClose is set and fd opened', async done => {
        concurrent.on('error', done.fail);
        concurrent.on('close', () => {
            expect(fsOpenMock).toHaveBeenCalledTimes(1);
            expect(fsCloseMock).toHaveBeenCalledTimes(1);
            done();
        });
        fsOpenMock.mockResolvedValue(0);
        fsCloseMock.mockResolvedValue(undefined);
        const N = 5;
        for (let i = 0; i < N; ++i) {
            concurrent.ref();
            await concurrent.openAsync();
        }
        for (let i = 0; i < N; ++i) {
            concurrent.unref();
        }
    });

    it('does not emit close when autoClose is not set and fd opened', async done => {
        concurrent = new ConcurrentStream(blobIn, { autoClose: false });
        fsOpenMock = jest.spyOn(concurrent, 'fsOpenAsync');
        fsCloseMock = jest.spyOn(concurrent, 'fsCloseAsync');

        concurrent.on('error', done.fail);
        concurrent.on('close', done.fail);
        fsOpenMock.mockResolvedValue(0);
        fsCloseMock.mockResolvedValue(undefined);
        const N = 5;
        for (let i = 0; i < N; ++i) {
            concurrent.ref();
            await concurrent.openAsync();
        }
        for (let i = 0; i < N; ++i) {
            concurrent.unref();
        }
        expect(fsOpenMock).toHaveBeenCalledTimes(1);
        expect(fsCloseMock).not.toHaveBeenCalled();
        setImmediate(done);
    });

    it('emits close when autoClose is set and fd not opened', async done => {
        concurrent.on('error', done.fail);
        concurrent.on('close', () => {
            expect(fsOpenMock).not.toBeCalled();
            expect(fsCloseMock).not.toBeCalled();
            done();
        });
        fsOpenMock.mockResolvedValue(0);
        fsCloseMock.mockResolvedValue(undefined);
        concurrent.ref();
        concurrent.unref();
    });

    it('emits error when autoClose is set and error occured', async done => {
        concurrent.on('error', (err) => {
            expect(() => { throw err; }).toThrowError(closeError);
            expect(fsOpenMock).toHaveBeenCalledTimes(1);
            expect(fsCloseMock).toHaveBeenCalledTimes(1);
            done();
        });
        concurrent.on('close', done.fail);
        fsOpenMock.mockResolvedValue(0);
        fsCloseMock.mockRejectedValue(closeError);
        const N = 5;
        for (let i = 0; i < N; ++i) {
            concurrent.ref();
            await concurrent.openAsync();
        }
        for (let i = 0; i < N; ++i) {
            concurrent.unref();
        }
    });

    it('does not not open and close fd more than once', async done => {
        concurrent.on('error', done.fail);
        fsOpenMock.mockResolvedValue(0);
        fsCloseMock.mockResolvedValue(undefined);
        await concurrent.openAsync();
        await concurrent.openAsync();
        await concurrent.closeAsync();
        await concurrent.closeAsync();
        expect(fsOpenMock).toHaveBeenCalledTimes(1);
        expect(fsCloseMock).toHaveBeenCalledTimes(1);
        done();
    });

    it('cancels read when cancelling condition is satisfied', async done => {
        concurrent.on('error', done.fail);
        await concurrent.readAsync(dummy, 0, dummy.length, 0, () => true);
        expect(fsOpenMock).not.toBeCalled();
        expect(fsReadMock).not.toBeCalled();
        done();
    });

    it('cancels write when cancelling condition is satisfied', async done => {
        concurrent.on('error', done.fail);
        await concurrent.writeAsync(dummy, 0, dummy.length, 0, () => true);
        expect(fsOpenMock).not.toBeCalled();
        expect(fsWriteMock).not.toBeCalled();
        done();
    });
});
