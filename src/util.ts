import { ReadStreamOptions } from './read-stream';
import { WriteStreamOptions } from './write-stream';

const defaultOptions: ReadStreamOptions | WriteStreamOptions = {
    start: 0,
    end: Infinity,
    highWaterMark: 64 * 1024,
};

export function applyDefaultOptions(
        options?: ReadStreamOptions | WriteStreamOptions): ReadStreamOptions | WriteStreamOptions {
    options = Object.assign({}, defaultOptions, options);
    if (typeof options.start !== 'number' || isNaN(options.start)) {
        throw new TypeError('"start" option must be a number');
    }
    if (typeof options.end !== 'number' || isNaN(options.end)) {
        throw new TypeError('"end" option must be a number');
    }
    if (options.start < 0 || options.end < 0) {
        throw new TypeError('"start", "end", and "highWaterMark" option must be >= 0');
    }
    if (!isFinite(options.start)) {
        throw new TypeError('"start" and "highWaterMark" option must be finite');
    }
    if (options.start > options.end) {
        throw new RangeError('"start" option must be <= "end" option');
    }
    return options;
}
