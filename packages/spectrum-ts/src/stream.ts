export interface MessageStream<T> {
  close(): void;
  push(msg: T): void;
  stream: AsyncIterable<T>;
}

export function createMessageStream<T>(): MessageStream<T> {
  const queue: T[] = [];
  const waiters: Array<(result: IteratorResult<T>) => void> = [];
  let closed = false;

  const push = (msg: T) => {
    if (closed) {
      return;
    }
    const waiter = waiters.shift();
    if (waiter) {
      waiter({ value: msg, done: false });
    } else {
      queue.push(msg);
    }
  };

  const close = () => {
    closed = true;
    for (const waiter of waiters) {
      waiter({ value: undefined as T, done: true });
    }
    waiters.length = 0;
    queue.length = 0;
  };

  const stream: AsyncIterable<T> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<T>> {
          const queued = queue.shift();
          if (queued !== undefined) {
            return Promise.resolve({ value: queued, done: false });
          }
          if (closed) {
            return Promise.resolve({
              value: undefined as T,
              done: true,
            });
          }
          return new Promise((resolve) => waiters.push(resolve));
        },
        return(): Promise<IteratorResult<T>> {
          close();
          return Promise.resolve({ value: undefined as T, done: true });
        },
      };
    },
  };

  return { push, stream, close };
}
