'use strict';

const PENDING = 'pending';
const RESOLVED = 'resolved';
const REJECTED = 'rejected';

class MyPromise {
  constructor(executor) {
    this.status = PENDING;
    this.value = undefined; // resolved 'value' or rejected 'reason'.
    this.onResolvedCallbacks = [];
    this.onRejectedCallbacks = [];

    let resolve = (res) => {
      // 2.1.2.1/2.1.3.1. When fulfilled/rejected, a promise must not transition
      // to any other state.
      if (this.status !== PENDING)
        return;
      this.value = res;
      this.status = RESOLVED;
      this.onResolvedCallbacks.forEach(f => f());
    }

    let reject = (err) => {
      // 2.1.2.1/2.1.3.1. When fulfilled/rejected, a promise must not transition
      // to any other state.
      if (this.status !== PENDING)
        return;
      this.value = err;
      this.status = REJECTED;
      this.onRejectedCallbacks.forEach(f => f());
    }

    try {
      executor(resolve, reject)
    } catch (err) {
      reject(err)
    }
  }

  then(onFulfilled, onRejected) {
    onFulfilled = typeof onFulfilled === 'function' ? onFulfilled : v => v;
    onRejected = typeof onRejected === 'function' ? onRejected : err => {
      throw err;
    };

    let newPromise = new MyPromise((resolve, reject) => {
      switch (this.status) {
        case RESOLVED:
          {
            // Add a new microtask to the queue.
            setTimeout(() => {
              // This is an asynchronous operation, try-catch in constructor cannot
              // catch the exception. We need to try it again here.
              try {
                // `x` may be a promise or a value.
                let x = onFulfilled(this.value);
                resolvePromise(newPromise, x, resolve, reject);
              } catch (err) {
                reject(err);
              }
            }, 0);
          }
          break;
        case REJECTED:
          {
            setTimeout(() => {
              try {
                let x = onRejected(this.value);
                resolvePromise(newPromise, x, resolve, reject);
              } catch (err) {
                reject(err);
              }
            }, 0);
          }
          break;
        case PENDING:
          {
            this.onResolvedCallbacks.push(() => {
              setTimeout(() => {
                try {
                  let x = onFulfilled(this.value);
                  resolvePromise(newPromise, x, resolve, reject);
                } catch (err) {
                  reject(err);
                }
              }, 0);
            });

            this.onRejectedCallbacks.push(() => {
              setTimeout(() => {
                try {
                  let x = onRejected(this.value);
                  resolvePromise(newPromise, x, resolve, reject);
                } catch (err) {
                  reject(err);
                }
              }, 0);
            });
          }
          break;
      }
    });

    return newPromise;
  }

  catch(onRejected) {
    return this.then(null, onRejected);
  }

  static resolve(data) {
    return new MyPromise((resolve, _reject) => {
      resolve(data);
    })
  }

  static reject(reason) {
    return new MyPromise((_resolve, reject) => {
      reject(reason);
    })
  }

  finally(callback) {
    return this.then(
      value => MyPromise.resolve(callback()).then(() => value),
      reason => MyPromise.resolve(callback()).then(() => { throw reason; })
    )
  }

  static all(promises) {
    return new MyPromise((resolve, reject) => {
      let results = []; // Results of each promise.
      let count = 0;
      const processData = (key, data) => {
        results[key] = data;
        if (++count === promises.length) {
          resolve(results)
        }
      }
      for (let i = 0; i < promises.length; i++) {
        let result = promises[i];
        if (isPromise(result)) {
          result.then(data => {
            processData(i, data);
          }, reject)
        } else {
          processData(i, result)
        }
      }
    })
  }

  static race(promises) {
    return new MyPromise((resolve, reject) => {
      for (let i = 0; i < promises.length; i++) {
        let result = promises[i];
        if (isPromise(result)) {
          result.then(resolve, reject)
        } else {
          resolve(result);
        }
      }
    });
  }
}

// 2.3. The Promise Resolution Procedure
//
// The promise resolution procedure is an abstract operation taking as input a
// promise and a value, which we denote as `[[Resolve]](promise, x)`. If `x` is
// a thenable, it attempts to make promise adopt the state of `x`, under the
// assumption that `x` behaves at least somewhat like a promise. Otherwise, it
// fulfills promise with the value `x`.
const resolvePromise = (newPromise, x, resolve, reject) => {
  // `x` is the return value of the last `onFulfilled` or `onRejected` callback.

  // 2.3.1. If `promise` and `x` refer to the same object, reject promise with a
  // `TypeError` as the reason.
  if (newPromise === x) {
    return reject(new TypeError('Chaining cycle detected for promise #<Promise>'))
  }

  let called = false; // Don't call `resolve` or `reject` more than once.
  if ((typeof x === 'object' && x != null) || typeof x === 'function') {
    try {
      // Don't use `x.then` multiple times, it may be a getter.
      let then = x.then;
      if (typeof then === 'function') { // This is a thenable.
        // 2.3.2. If `x` is a promise, adopt its state
        then.call(/* thisArg = */x,
          y => {
            if (called) return;
            called = true;
            resolvePromise(newPromise, y, resolve, reject);
          },
          err => { reject(err); },
        );
      } else {
        if (called) return;
        called = true;
        resolve(x);
      }
    } catch (err) { // Getters of `x.then` may throw.
      if (called) return;
      called = true;
      reject(err);
    }
  } else { // A trivial value, just resolve it.
    resolve(x);
  }
}

const isPromise =
  obj => typeof obj === 'function' ||
         typeof obj === 'object' && obj !== null && obj.then && typeof obj.then === 'function';

MyPromise.defer = MyPromise.deferred = () => {
    let dfd = {};
    dfd.promise = new MyPromise((resolve, reject) => {
      dfd.resolve = resolve;
      dfd.reject = reject;
    })
    return dfd
}

module.exports = MyPromise
