# concurrent-streams

[![Build Status](https://travis-ci.org/mvisat/concurrent-streams.svg?branch=master)](https://travis-ci.org/mvisat/concurrent-streams)
[![codecov](https://codecov.io/gh/mvisat/concurrent-streams/branch/master/graph/badge.svg)](https://codecov.io/gh/mvisat/concurrent-streams)

Node.js safe multiple concurrent readable and writable streams from the same file.

## Install
```
$ yarn add concurrent-streams
```

## Quick Usage
```js
// TODO
```

## API

### `new ConcurrentStream(path, [options])`
- `path: string`
- `options?: StreamOptions`
    - `flags?: string` **Default:** `'r+'`
    - `fd?: number` **Default:** `undefined`
    - `mode?: number` **Default:** `0o666`
    - `autoClose?: boolean` **Default:** `true`
- Returns: instance of `ConcurrentStream`.

`flags` mode when opening a file. See [file system flags](https://nodejs.org/api/fs.html#fs_file_system_flags).

`path` will be ignored if `fd` is set, and no `open` event will be emitted.

`mode` sets the file permission if the file was created.

If `autoClose` is `true`, the file descriptor will be closed if no `ReadStream` or `WriteStream` referencing it. If `autoClose` is `false` it is the application's responsibility to close it and make sure there are no leak.

### `createReadStream([options])`
- `options?: ReadStreamOptions`
    - `encoding?: string` **Default:** `'utf8'`
    - `start?: number` **Default:** `0`
    - `end?: number` **Default:** `Infinity`
    - `highWaterMark` **Default:** `128 * 1024`
- Returns: instance of `ReadStream`, extending [`stream.Readable`](https://nodejs.org/api/stream.html#stream_class_stream_readable).

`encoding` can be any one of those accepted by `Buffer`.

`start` and `end` can be used to read a range of bytes from the file. Both `start` and `end` is **inclusive** and start counting at 0.

`highWaterMark` is for readable stream high water mark.

### `createWriteStream([options])`
- `options?: ReadStreamOptions`
    - `encoding?: string` **Default:** `'utf8'`
    - `start?: number` **Default:** `0`
- Returns: instance of `WriteStream`, extending [`stream.Writable`](https://nodejs.org/api/stream.html#stream_class_stream_writable).

`encoding` can be any one of those accepted by `Buffer`.

`start` can be used to write data at some position past beginning of the file.

## Class: `ConcurrentStream`

### Event: `'open'`
- `fd: number` file descriptor used.

Emitted when file descriptor has been opened.

### Event: `'close'`

Emitted when file descriptor has been closed.

### Event: `'error'`

Emitted when error occured.

## Class: `ReadStream`

### Event: `'read'`
- `bytesRead: number`, number of bytes read.

Emitted every time bytes has been succesfully read from file.

### Event: `'error'`
- `Error`

Emitten when error occured.

### Property: `readStream.position`
Current offset from beginning of file.

## Class: `WriteStream`

### Event: `'written'`
- `bytesWritten: number`, number of bytes written.

Emitted every time bytes has been succesfully written to file.

### Event: `'finish'`

Emitted when all data has been flushed to underlying system.

### Event: `'error'`
- `Error`

Emitten when error occured.

### Property: `writeStream.position`
Current offset from beginning of file.

## License
[MIT](LICENSE)
