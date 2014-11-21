"use strict";

/**
 * CSP requires ES6 generators
 * so included is the output of
 * the tracuer compiler and a
 * subset of the traceur runtime
 **/
var $traceurRuntime = (function() {
    "use strict";

    // Copyright 2014 Traceur Authors.
    //
    // Licensed under the Apache License, Version 2.0 (the "License");
    // you may not use this file except in compliance with the License.
    // You may obtain a copy of the License at
    //
    //      http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing, software
    // distributed under the License is distributed on an "AS IS" BASIS,
    // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    // See the License for the specific language governing permissions and
    // limitations under the License.
    
    var $create = Object.create;
    var privateNames = $create(null);
    var createPrivateName = function createPrivateName() {
        var s = newUniqueString();
        privateNames[s] = true;
        return s;
    };
    var $defineProperties = Object.defineProperties;
    var $defineProperty = Object.defineProperty;
    var $TypeError = TypeError;
    var counter = 0;

    function newUniqueString() {
        return '__$' + Math.floor(Math.random() * 1e9) + '$' + ++counter + '$__';
    }

    function nonEnum(value) {
        return {
            configurable: true,
            enumerable: false,
            value: value,
            writable: true
        };
    }

    // Generator states. Terminology roughly matches that of
    //   http://wiki.ecmascript.org/doku.php?id=harmony:generators
    // Since 'state' is already taken, use 'GState' instead to denote what's
    // referred to as "G.[[State]]" on that page.
    var ST_NEWBORN = 0;
    var ST_EXECUTING = 1;
    var ST_SUSPENDED = 2;
    var ST_CLOSED = 3;

    var END_STATE = -2;
    var RETHROW_STATE = -3;


    function getInternalError(state) {
        return new Error('Traceur compiler bug: invalid state in state machine: ' +
                         state);
    }

    function GeneratorContext() {
        this.state = 0;
        this.GState = ST_NEWBORN;
        this.storedException = undefined;
        this.finallyFallThrough = undefined;
        this.sent_ = undefined;
        this.returnValue = undefined;
        this.tryStack_ = [];
    }
    GeneratorContext.prototype = {
        pushTry: function(catchState, finallyState) {
            if (finallyState !== null) {
                var finallyFallThrough = null;
                for (var i = this.tryStack_.length - 1; i >= 0; i--) {
                    if (this.tryStack_[i].catch !== undefined) {
                        finallyFallThrough = this.tryStack_[i].catch;
                        break;
                    }
                }
                if (finallyFallThrough === null)
                    finallyFallThrough = RETHROW_STATE;

                this.tryStack_.push({
                    finally: finallyState,
                    finallyFallThrough: finallyFallThrough
                });
            }

            if (catchState !== null) {
                this.tryStack_.push({catch: catchState});
            }
        },
        popTry: function() {
            this.tryStack_.pop();
        },
        get sent() {
            this.maybeThrow();
            return this.sent_;
        },
        set sent(v) {
            this.sent_ = v;
        },
        get sentIgnoreThrow() {
            return this.sent_;
        },
        maybeThrow: function() {
            if (this.action === 'throw') {
                this.action = 'next';
                throw this.sent_;
            }
        },
        end: function() {
            switch (this.state) {
            case END_STATE:
                return this;
            case RETHROW_STATE:
                throw this.storedException;
            default:
                throw getInternalError(this.state);
            }
        },
        handleException: function(ex) {
            this.GState = ST_CLOSED;
            this.state = END_STATE;
            throw ex;
        }
    };

    function nextOrThrow(ctx, moveNext, action, x) {
        switch (ctx.GState) {
        case ST_EXECUTING:
            throw new Error('"' + action + '" on executing generator');

        case ST_CLOSED:
            if (action == 'next') {
                return {
                    value: undefined,
                    done: true
                };
            }
            throw x;

        case ST_NEWBORN:
            if (action === 'throw') {
                ctx.GState = ST_CLOSED;
                throw x;
            }
            if (x !== undefined)
                throw $TypeError('Sent value to newborn generator');
            // fall through

        case ST_SUSPENDED:
            ctx.GState = ST_EXECUTING;
            ctx.action = action;
            ctx.sent = x;
            var value = moveNext(ctx);
            var done = value === ctx;
            if (done)
                value = ctx.returnValue;
            ctx.GState = done ? ST_CLOSED : ST_SUSPENDED;
            return {value: value, done: done};
        }
    }

    var ctxName = createPrivateName();
    var moveNextName = createPrivateName();

    function GeneratorFunction() {}

    function GeneratorFunctionPrototype() {}

    GeneratorFunction.prototype = GeneratorFunctionPrototype;

    $defineProperty(GeneratorFunctionPrototype, 'constructor',
                    nonEnum(GeneratorFunction));

    GeneratorFunctionPrototype.prototype = {
        constructor: GeneratorFunctionPrototype,
        next: function(v) {
            return nextOrThrow(this[ctxName], this[moveNextName], 'next', v);
        },
        throw: function(v) {
            return nextOrThrow(this[ctxName], this[moveNextName], 'throw', v);
        }
    };

    $defineProperties(GeneratorFunctionPrototype.prototype, {
        constructor: {enumerable: false},
        next: {enumerable: false},
        throw: {enumerable: false},
    });

    Object.defineProperty(GeneratorFunctionPrototype.prototype, Symbol.iterator,
                          nonEnum(function() {
                              return this;
                          }));

    function createGeneratorInstance(innerFunction, functionObject, self) {
        // TODO(arv): Use [[GeneratorState]]
        var moveNext = getMoveNext(innerFunction, self);
        var ctx = new GeneratorContext();

        var object = $create(functionObject.prototype);
        object[ctxName] = ctx;
        object[moveNextName] = moveNext;
        return object;
    }

    function initGeneratorFunction(functionObject) {
        functionObject.prototype = $create(GeneratorFunctionPrototype.prototype);
        functionObject.__proto__ = GeneratorFunctionPrototype;
        return functionObject;
    }

    function AsyncFunctionContext() {
        GeneratorContext.call(this);
        this.err = undefined;
        var ctx = this;
        ctx.result = new Promise(function(resolve, reject) {
            ctx.resolve = resolve;
            ctx.reject = reject;
        });
    }
    AsyncFunctionContext.prototype = $create(GeneratorContext.prototype);
    AsyncFunctionContext.prototype.end = function() {
        switch (this.state) {
        case END_STATE:
            this.resolve(this.returnValue);
            break;
        case RETHROW_STATE:
            this.reject(this.storedException);
            break;
        default:
            this.reject(getInternalError(this.state));
        }
    };
    AsyncFunctionContext.prototype.handleException = function() {
        this.state = RETHROW_STATE;
    };

    function asyncWrap(innerFunction, self) {
        var moveNext = getMoveNext(innerFunction, self);
        var ctx = new AsyncFunctionContext();
        ctx.createCallback = function(newState) {
            return function (value) {
                ctx.state = newState;
                ctx.value = value;
                moveNext(ctx);
            };
        }

        ctx.errback = function(err) {
            handleCatch(ctx, err);
            moveNext(ctx);
        };

        moveNext(ctx);
        return ctx.result;
    }

    function getMoveNext(innerFunction, self) {
        return function(ctx) {
            while (true) {
                try {
                    return innerFunction.call(self, ctx);
                } catch (ex) {
                    handleCatch(ctx, ex);
                }
            }
        };
    }

    function handleCatch(ctx, ex) {
        ctx.storedException = ex;
        var last = ctx.tryStack_[ctx.tryStack_.length - 1];
        if (!last) {
            ctx.handleException(ex);
            return;
        }

        ctx.state = last.catch !== undefined ? last.catch : last.finally;

        if (last.finallyFallThrough !== undefined)
            ctx.finallyFallThrough = last.finallyFallThrough;
    }

    return {
        asyncWrap: asyncWrap,
        initGeneratorFunction: initGeneratorFunction,
        createGeneratorInstance: createGeneratorInstance
    }
})();

// begin CSP

var core = (function() {
    "use strict";
    function spawn(gen, creator) {
        var ch = channels.chan(buffers.fixed(1));
        (new process.Process(gen, function(value) {
            if (value === channels.CLOSED) {
                ch.close();
            } else {
                process.put_then_callback(ch, value, function(ok) {
                    ch.close();
                });
            }
        }, creator)).run();
        return ch;
    }

    function go(f, args) {
        var gen = f.apply(null, args);
        return spawn(gen, f);
    }

    function chan(bufferOrNumber, xform, exHandler) {
        var buf;
        if (bufferOrNumber === 0) {
            bufferOrNumber = null;
        }
        if (typeof bufferOrNumber === "number") {
            buf = buffers.fixed(bufferOrNumber);
        } else {
            buf = bufferOrNumber;
        }
        return channels.chan(buf, xform, exHandler);
    }
    return {
        spawn: spawn,
        go: go,
        chan: chan
    };
})();

var channels = (function() {
    "use strict";
    var MAX_DIRTY = 64;
    var MAX_QUEUE_SIZE = 1024;
    var CLOSED = null;
    var Box = function(value) {
        this.value = value;
    };
    var PutBox = function(handler, value) {
        this.handler = handler;
        this.value = value;
    };
    var Channel = function(takes, puts, buf, xform) {
        this.buf = buf;
        this.xform = xform;
        this.takes = takes;
        this.puts = puts;
        this.dirty_takes = 0;
        this.dirty_puts = 0;
        this.closed = false;
    };
    function isReduced(v) {
        return v && v.__transducers_reduced__;
    }
    function schedule(f, v) {
        dispatch.run(function() {
            f(v);
        });
    }
    Channel.prototype._put = function(value, handler) {
        if (value === CLOSED) {
            throw new Error("Cannot put CLOSED on a channel.");
        }
        if (!handler.is_active()) {
            return null;
        }
        if (this.closed) {
            handler.commit();
            return new Box(false);
        }
        var taker,
            callback;
        if (this.buf && !this.buf.is_full()) {
            handler.commit();
            var done = isReduced(this.xform.step(this.buf, value));
            while (true) {
                if (this.buf.count() === 0) {
                    break;
                }
                taker = this.takes.pop();
                if (taker === buffers.EMPTY) {
                    break;
                }
                if (taker.is_active()) {
                    callback = taker.commit();
                    value = this.buf.remove();
                    schedule(callback, value);
                }
            }
            if (done) {
                this.close();
            }
            return new Box(true);
        }
        while (true) {
            taker = this.takes.pop();
            if (taker === buffers.EMPTY) {
                break;
            }
            if (taker.is_active()) {
                handler.commit();
                callback = taker.commit();
                schedule(callback, value);
                return new Box(true);
            }
        }
        if (this.dirty_puts > MAX_DIRTY) {
            this.puts.cleanup(function(putter) {
                return putter.handler.is_active();
            });
            this.dirty_puts = 0;
        } else {
            this.dirty_puts++;
        }
        if (this.puts.length >= MAX_QUEUE_SIZE) {
            throw new Error("No more than " + MAX_QUEUE_SIZE + " pending puts are allowed on a single channel.");
        }
        this.puts.unbounded_unshift(new PutBox(handler, value));
        return null;
    };
    Channel.prototype._take = function(handler) {
        if (!handler.is_active()) {
            return null;
        }
        var putter,
            put_handler,
            callback,
            value;
        if (this.buf && this.buf.count() > 0) {
            handler.commit();
            value = this.buf.remove();
            while (true) {
                if (this.buf.is_full()) {
                    break;
                }
                putter = this.puts.pop();
                if (putter === buffers.EMPTY) {
                    break;
                }
                put_handler = putter.handler;
                if (put_handler.is_active()) {
                    callback = put_handler.commit();
                    if (callback) {
                        schedule(callback, true);
                    }
                    if (isReduced(this.xform.step(this.buf, putter.value))) {
                        this.close();
                    }
                }
            }
            return new Box(value);
        }
        while (true) {
            putter = this.puts.pop();
            if (putter === buffers.EMPTY) {
                break;
            }
            put_handler = putter.handler;
            if (put_handler.is_active()) {
                callback = put_handler.commit();
                if (callback) {
                    schedule(callback, true);
                }
                return new Box(putter.value);
            }
        }
        if (this.closed) {
            handler.commit();
            return new Box(CLOSED);
        }
        if (this.dirty_takes > MAX_DIRTY) {
            this.takes.cleanup(function(handler) {
                return handler.is_active();
            });
            this.dirty_takes = 0;
        } else {
            this.dirty_takes++;
        }
        if (this.takes.length >= MAX_QUEUE_SIZE) {
            throw new Error("No more than " + MAX_QUEUE_SIZE + " pending takes are allowed on a single channel.");
        }
        this.takes.unbounded_unshift(handler);
        return null;
    };
    Channel.prototype.close = function() {
        if (this.closed) {
            return;
        }
        this.closed = true;
        if (this.buf) {
            this.xform.result(this.buf);
            while (true) {
                if (this.buf.count() === 0) {
                    break;
                }
                taker = this.takes.pop();
                if (taker === buffers.EMPTY) {
                    break;
                }
                if (taker.is_active()) {
                    callback = taker.commit();
                    var value = this.buf.remove();
                    schedule(callback, value);
                }
            }
        }
        while (true) {
            var taker = this.takes.pop();
            if (taker === buffers.EMPTY) {
                break;
            }
            if (taker.is_active()) {
                var callback = taker.commit();
                schedule(callback, CLOSED);
            }
        }
        while (true) {
            var putter = this.puts.pop();
            if (putter === buffers.EMPTY) {
                break;
            }
            if (putter.handler.is_active()) {
                var put_callback = putter.handler.commit();
                if (put_callback) {
                    schedule(put_callback, false);
                }
            }
        }
    };
    Channel.prototype.is_closed = function() {
        return this.closed;
    };
    function defaultHandler(e) {
        console.log('error in channel transformer', e.stack);
        return CLOSED;
    }
    function handleEx(buf, exHandler, e) {
        var def = (exHandler || defaultHandler)(e);
        if (def !== CLOSED) {
            buf.add(def);
        }
        return buf;
    }
    function AddTransformer() {}
    AddTransformer.prototype.init = function() {
        throw new Error('init not available');
    };
    AddTransformer.prototype.result = function(v) {
        return v;
    };
    AddTransformer.prototype.step = function(buffer, input) {
        buffer.add(input);
        return buffer;
    };
    function handleException(exHandler) {
        return function(xform) {
            return {
                step: function(buffer, input) {
                    try {
                        return xform.step(buffer, input);
                    } catch (e) {
                        return handleEx(buffer, exHandler, e);
                    }
                },
                result: function(buffer) {
                    try {
                        return xform.result(buffer);
                    } catch (e) {
                        return handleEx(buffer, exHandler, e);
                    }
                }
            };
        };
    }
    return {
        chan: function(buf, xform, exHandler) {
            if (xform) {
                if (!buf) {
                    throw new Error("Only buffered channels can use transducers");
                }
                xform = xform(new AddTransformer());
            } else {
                xform = new AddTransformer();
            }
            xform = handleException(exHandler)(xform);
            return new Channel(buffers.ring(32), buffers.ring(32), buf, xform);
        },
        Box: Box,
        Channel: Channel,
        CLOSED: CLOSED
    };
})();

var buffers = (function() {
    "use strict";
    function acopy(src, src_start, dst, dst_start, length) {
        var count = 0;
        while (true) {
            if (count >= length) {
                break;
            }
            dst[dst_start + count] = src[src_start + count];
            count++;
        }
    }
    var EMPTY = {toString: function() {
        return "[object EMPTY]";
    }};
    var RingBuffer = function(head, tail, length, array) {
        this.length = length;
        this.array = array;
        this.head = head;
        this.tail = tail;
    };
    RingBuffer.prototype._unshift = function(item) {
        var array = this.array;
        var head = this.head;
        array[head] = item;
        this.head = (head + 1) % array.length;
        this.length++;
    };
    RingBuffer.prototype._resize = function() {
        var array = this.array;
        var new_length = 2 * array.length;
        var new_array = new Array(new_length);
        var head = this.head;
        var tail = this.tail;
        var length = this.length;
        if (tail < head) {
            acopy(array, tail, new_array, 0, length);
            this.tail = 0;
            this.head = length;
            this.array = new_array;
        } else if (tail > head) {
            acopy(array, tail, new_array, 0, array.length - tail);
            acopy(array, 0, new_array, array.length - tail, head);
            this.tail = 0;
            this.head = length;
            this.array = new_array;
        } else if (tail === head) {
            this.tail = 0;
            this.head = 0;
            this.array = new_array;
        }
    };
    RingBuffer.prototype.unbounded_unshift = function(item) {
        if (this.length + 1 === this.array.length) {
            this._resize();
        }
        this._unshift(item);
    };
    RingBuffer.prototype.pop = function() {
        if (this.length === 0) {
            return EMPTY;
        }
        var array = this.array;
        var tail = this.tail;
        var item = array[tail];
        array[tail] = null;
        this.tail = (tail + 1) % array.length;
        this.length--;
        return item;
    };
    RingBuffer.prototype.cleanup = function(predicate) {
        var length = this.length;
        for (var i = 0; i < length; i++) {
            var item = this.pop();
            if (predicate(item)) {
                this._unshift(item);
            }
        }
    };
    var FixedBuffer = function(buf, n) {
        this.buf = buf;
        this.n = n;
    };
    FixedBuffer.prototype.is_full = function() {
        return this.buf.length >= this.n;
    };
    FixedBuffer.prototype.remove = function() {
        return this.buf.pop();
    };
    FixedBuffer.prototype.add = function(item) {
        this.buf.unbounded_unshift(item);
    };
    FixedBuffer.prototype.count = function() {
        return this.buf.length;
    };
    var DroppingBuffer = function(buf, n) {
        this.buf = buf;
        this.n = n;
    };
    DroppingBuffer.prototype.is_full = function() {
        return false;
    };
    DroppingBuffer.prototype.remove = function() {
        return this.buf.pop();
    };
    DroppingBuffer.prototype.add = function(item) {
        if (this.buf.length < this.n) {
            this.buf._unshift(item);
        }
    };
    DroppingBuffer.prototype.count = function() {
        return this.buf.length;
    };
    var SlidingBuffer = function(buf, n) {
        this.buf = buf;
        this.n = n;
    };
    SlidingBuffer.prototype.is_full = function() {
        return false;
    };
    SlidingBuffer.prototype.remove = function() {
        return this.buf.pop();
    };
    SlidingBuffer.prototype.add = function(item) {
        if (this.buf.length === this.n) {
            this.buf.pop();
        }
        this.buf._unshift(item);
    };
    SlidingBuffer.prototype.count = function() {
        return this.buf.length;
    };
    var ring = function ring_buffer(n) {
        return new RingBuffer(0, 0, 0, new Array(n));
    };
    return {
        ring: ring,
        fixed: function fixed_buffer(n) {
            return new FixedBuffer(ring(n), n);
        },
        dropping: function dropping_buffer(n) {
            return new DroppingBuffer(ring(n), n);
        },
        sliding: function sliding_buffer(n) {
            return new SlidingBuffer(ring(n), n);
        },
        EMPTY: EMPTY
    };
})();

var dispatch = (function() {
    "use strict";
    var TASK_BATCH_SIZE = 1024;
    var tasks = buffers.ring(32);
    var running = false;
    var queued = false;
    var queue_dispatcher;
    function process_messages() {
        running = true;
        queued = false;
        var count = 0;
        while (true) {
            var task = tasks.pop();
            if (task === buffers.EMPTY) {
                break;
            }
            task();
            if (count >= TASK_BATCH_SIZE) {
                break;
            }
            count++;
        }
        running = false;
        if (tasks.length > 0) {
            queue_dispatcher();
        }
    }
    if (typeof MessageChannel !== "undefined") {
        var message_channel = new MessageChannel();
        message_channel.port1.onmessage = function(_) {
            process_messages();
        };
        queue_dispatcher = function() {
            if (!(queued && running)) {
                queued = true;
                message_channel.port2.postMessage(0);
            }
        };
    } else if (typeof setImmediate !== "undefined") {
        queue_dispatcher = function() {
            if (!(queued && running)) {
                queued = true;
                setImmediate(process_messages);
            }
        };
    } else {
        queue_dispatcher = function() {
            if (!(queued && running)) {
                queued = true;
                setTimeout(process_messages, 0);
            }
        };
    }
    return {
        run: function(f) {
            tasks.unbounded_unshift(f);
            queue_dispatcher();
        },
        queue_delay: function(f, delay) {
            setTimeout(f, delay);
        }
    };
})();

var process = (function() {
    "use strict";
    var Channel = channels.Channel;
    var FnHandler = function(f) {
        this.f = f;
    };
    FnHandler.prototype.is_active = function() {
        return true;
    };
    FnHandler.prototype.commit = function() {
        return this.f;
    };
    function put_then_callback(channel, value, callback) {
        var result = channel._put(value, new FnHandler(callback));
        if (result && callback) {
            callback(result.value);
        }
    }
    function take_then_callback(channel, callback) {
        var result = channel._take(new FnHandler(callback));
        if (result) {
            callback(result.value);
        }
    }
    var Process = function(gen, onFinish, creator) {
        this.gen = gen;
        this.creatorFunc = creator;
        this.finished = false;
        this.onFinish = onFinish;
    };
    var Instruction = function(op, data) {
        this.op = op;
        this.data = data;
    };
    var TAKE = "take";
    var PUT = "put";
    var SLEEP = "sleep";
    var ALTS = "alts";
    Process.prototype._continue = function(response) {
        var self = this;
        dispatch.run(function() {
            self.run(response);
        });
    };
    Process.prototype._done = function(value) {
        if (!this.finished) {
            this.finished = true;
            var onFinish = this.onFinish;
            if (typeof onFinish === "function") {
                dispatch.run(function() {
                    onFinish(value);
                });
            }
        }
    };
    Process.prototype.run = function(response) {
        if (this.finished) {
            return;
        }
        var iter = this.gen.next(response);
        if (iter.done) {
            this._done(iter.value);
            return;
        }
        var ins = iter.value;
        var self = this;
        if (ins instanceof Instruction) {
            switch (ins.op) {
            case PUT:
                var data = ins.data;
                put_then_callback(data.channel, data.value, function(ok) {
                    self._continue(ok);
                });
                break;
            case TAKE:
                var channel = ins.data;
                take_then_callback(channel, function(value) {
                    self._continue(value);
                });
                break;
            case SLEEP:
                var msecs = ins.data;
                dispatch.queue_delay(function() {
                    self.run(null);
                }, msecs);
                break;
            case ALTS:
                select.do_alts(ins.data.operations, function(result) {
                    self._continue(result);
                }, ins.data.options);
                break;
            }
        } else if (ins instanceof Channel) {
            var channel = ins;
            take_then_callback(channel, function(value) {
                self._continue(value);
            });
        } else {
            this._continue(ins);
        }
    };
    function take(channel) {
        return new Instruction(TAKE, channel);
    }
    function put(channel, value) {
        return new Instruction(PUT, {
            channel: channel,
            value: value
        });
    }
    function sleep(msecs) {
        return new Instruction(SLEEP, msecs);
    }
    function alts(operations, options) {
        return new Instruction(ALTS, {
            operations: operations,
            options: options
        });
    }
    return {
        put_then_callback: put_then_callback,
        take_then_callback: take_then_callback,
        put: put,
        take: take,
        sleep: sleep,
        alts: alts,
        Process: Process
    };
})();

var select = (function() {
    "use strict";
    var Box = channels.Box;
    var AltHandler = function(flag, f) {
        this.f = f;
        this.flag = flag;
    };
    AltHandler.prototype.is_active = function() {
        return this.flag.value;
    };
    AltHandler.prototype.commit = function() {
        this.flag.value = false;
        return this.f;
    };
    var AltResult = function(value, channel) {
        this.value = value;
        this.channel = channel;
    };
    function rand_int(n) {
        return Math.floor(Math.random() * (n + 1));
    }
    function random_array(n) {
        var a = new Array(n);
        var i;
        for (i = 0; i < n; i++) {
            a[i] = 0;
        }
        for (i = 1; i < n; i++) {
            var j = rand_int(i);
            a[i] = a[j];
            a[j] = i;
        }
        return a;
    }
    var hasOwnProperty = Object.prototype.hasOwnProperty;
    var DEFAULT = {toString: function() {
        return "[object DEFAULT]";
    }};
    return {
        do_alts: function(operations, callback, options) {
            var length = operations.length;
            if (length === 0) {
                throw new Error("Empty alt list");
            }
            var priority = (options && options.priority) ? true : false;
            if (!priority) {
                var indexes = random_array(length);
            }
            var flag = new Box(true);
            for (var i = 0; i < length; i++) {
                var operation = operations[priority ? i : indexes[i]];
                var port,
                    result;
                if (operation instanceof Array) {
                    var value = operation[1];
                    port = operation[0];
                    result = port._put(value, (function(port) {
                        return new AltHandler(flag, function(ok) {
                            callback(new AltResult(ok, port));
                        });
                    })(port));
                } else {
                    port = operation;
                    result = port._take((function(port) {
                        return new AltHandler(flag, function(value) {
                            callback(new AltResult(value, port));
                        });
                    })(port));
                }
                if (result instanceof Box) {
                    callback(new AltResult(result.value, port));
                    break;
                }
            }
            if (!(result instanceof Box) && options && hasOwnProperty.call(options, "default")) {
                if (flag.value) {
                    flag.value = false;
                    callback(new AltResult(options["default"], DEFAULT));
                }
            }
        },
        DEFAULT: DEFAULT
    };
})();

var timers = (function() {
    "use strict";
    return {
        timeout: function timeout_channel(msecs) {
            var chan = channels.chan();
            dispatch.queue_delay(function() {
                chan.close();
            }, msecs);
            return chan;
        }
    };
})();

var operations = (function() {
    "use strict";
    var $__0 = $traceurRuntime.initGeneratorFunction(mapcat);
    var Box = channels.Box,
        go = core.go,
        take = core.take,
        put = core.put,
        takeAsync = process.take_then_callback,
        putAsync = process.put_then_callback,
        alts = process.alts,
        chan = core.chan,
        CLOSED = core.CLOSED;

    function mapFrom(f, ch) {
        return {
            is_closed: function() {
                return ch.is_closed();
            },
            close: function() {
                ch.close();
            },
            _put: function(value, handler) {
                return ch._put(value, handler);
            },
            _take: function(handler) {
                var result = ch._take({
                    is_active: function() {
                        return handler.is_active();
                    },
                    commit: function() {
                        var take_cb = handler.commit();
                        return function(value) {
                            return take_cb(value === CLOSED ? CLOSED : f(value));
                        };
                    }
                });
                if (result) {
                    var value = result.value;
                    return new Box(value === CLOSED ? CLOSED : f(value));
                } else {
                    return null;
                }
            }
        };
    }

    function mapInto(f, ch) {
        return {
            is_closed: function() {
                return ch.is_closed();
            },
            close: function() {
                ch.close();
            },
            _put: function(value, handler) {
                return ch._put(f(value), handler);
            },
            _take: function(handler) {
                return ch._take(handler);
            }
        };
    }
    function filterFrom(p, ch, bufferOrN) {
        var out = chan(bufferOrN);
        go($traceurRuntime.initGeneratorFunction(function $__0() {
            var value;
            return $traceurRuntime.createGeneratorInstance(function($ctx) {
                while (true)
                    switch ($ctx.state) {
                    case 0:
                        $ctx.state = (true) ? 1 : -2;
                        break;
                    case 1:
                        $ctx.state = 2;
                        return take(ch);
                    case 2:
                        value = $ctx.sent;
                        $ctx.state = 4;
                        break;
                    case 4:
                        $ctx.state = (value === CLOSED) ? 7 : 6;
                        break;
                    case 7:
                        out.close();
                        $ctx.state = -2;
                        break;
                    case 6:
                        $ctx.state = (p(value)) ? 10 : 0;
                        break;
                    case 10:
                        $ctx.state = 11;
                        return put(out, value);
                    case 11:
                        $ctx.maybeThrow();
                        $ctx.state = 0;
                        break;
                    default:
                        return $ctx.end();
                    }
            }, $__0, this);
        }));
        return out;
    }
    function filterInto(p, ch) {
        return {
            is_closed: function() {
                return ch.is_closed();
            },
            close: function() {
                ch.close();
            },
            _put: function(value, handler) {
                if (p(value)) {
                    return ch._put(value, handler);
                } else {
                    return new Box(!ch.is_closed());
                }
            },
            _take: function(handler) {
                return ch._take(handler);
            }
        };
    }
    function removeFrom(p, ch) {
        return filterFrom(function(value) {
            return !p(value);
        }, ch);
    }
    function removeInto(p, ch) {
        return filterInto(function(value) {
            return !p(value);
        }, ch);
    }
    function mapcat(f, src, dst) {
        var value,
            seq,
            length,
            i;
        return $traceurRuntime.createGeneratorInstance(function($ctx) {
            while (true)
                switch ($ctx.state) {
                case 0:
                    $ctx.state = (true) ? 1 : -2;
                    break;
                case 1:
                    $ctx.state = 2;
                    return take(src);
                case 2:
                    value = $ctx.sent;
                    $ctx.state = 4;
                    break;
                case 4:
                    $ctx.state = (value === CLOSED) ? 7 : 19;
                    break;
                case 7:
                    dst.close();
                    $ctx.state = -2;
                    break;
                case 19:
                    seq = f(value);
                    length = seq.length;
                    $ctx.state = 20;
                    break;
                case 20:
                    i = 0;
                    $ctx.state = 15;
                    break;
                case 15:
                    $ctx.state = (i < length) ? 9 : 13;
                    break;
                case 12:
                    i++;
                    $ctx.state = 15;
                    break;
                case 9:
                    $ctx.state = 10;
                    return put(dst, seq[i]);
                case 10:
                    $ctx.maybeThrow();
                    $ctx.state = 12;
                    break;
                case 13:
                    $ctx.state = (dst.is_closed()) ? -2 : 0;
                    break;
                default:
                    return $ctx.end();
                }
        }, $__0, this);
    }
    function mapcatFrom(f, ch, bufferOrN) {
        var out = chan(bufferOrN);
        go(mapcat, [f, ch, out]);
        return out;
    }
    function mapcatInto(f, ch, bufferOrN) {
        var src = chan(bufferOrN);
        go(mapcat, [f, src, ch]);
        return src;
    }
    function pipe(src, dst, keepOpen) {
        go($traceurRuntime.initGeneratorFunction(function $__1() {
            var value,
                $__2,
                $__3;
            return $traceurRuntime.createGeneratorInstance(function($ctx) {
                while (true)
                    switch ($ctx.state) {
                    case 0:
                        $ctx.state = (true) ? 1 : -2;
                        break;
                    case 1:
                        $ctx.state = 2;
                        return take(src);
                    case 2:
                        value = $ctx.sent;
                        $ctx.state = 4;
                        break;
                    case 4:
                        $ctx.state = (value === CLOSED) ? 7 : 6;
                        break;
                    case 7:
                        if (!keepOpen) {
                            dst.close();
                        }
                        $ctx.state = -2;
                        break;
                    case 6:
                        $__2 = put(dst, value);
                        $ctx.state = 15;
                        break;
                    case 15:
                        $ctx.state = 11;
                        return $__2;
                    case 11:
                        $__3 = $ctx.sent;
                        $ctx.state = 13;
                        break;
                    case 13:
                        $ctx.state = (!$__3) ? -2 : 0;
                        break;
                    default:
                        return $ctx.end();
                    }
            }, $__1, this);
        }));
        return dst;
    }
    function split(p, ch, trueBufferOrN, falseBufferOrN) {
        var tch = chan(trueBufferOrN);
        var fch = chan(falseBufferOrN);
        go($traceurRuntime.initGeneratorFunction(function $__1() {
            var value;
            return $traceurRuntime.createGeneratorInstance(function($ctx) {
                while (true)
                    switch ($ctx.state) {
                    case 0:
                        $ctx.state = (true) ? 1 : -2;
                        break;
                    case 1:
                        $ctx.state = 2;
                        return take(ch);
                    case 2:
                        value = $ctx.sent;
                        $ctx.state = 4;
                        break;
                    case 4:
                        $ctx.state = (value === CLOSED) ? 7 : 6;
                        break;
                    case 7:
                        tch.close();
                        fch.close();
                        $ctx.state = -2;
                        break;
                    case 6:
                        $ctx.state = 11;
                        return put(p(value) ? tch : fch, value);
                    case 11:
                        $ctx.maybeThrow();
                        $ctx.state = 0;
                        break;
                    default:
                        return $ctx.end();
                    }
            }, $__1, this);
        }));
        return [tch, fch];
    }
    function reduce(f, init, ch) {
        return go($traceurRuntime.initGeneratorFunction(function $__1() {
            var result,
                value;
            return $traceurRuntime.createGeneratorInstance(function($ctx) {
                while (true)
                    switch ($ctx.state) {
                    case 0:
                        result = init;
                        $ctx.state = 12;
                        break;
                    case 12:
                        $ctx.state = (true) ? 1 : -2;
                        break;
                    case 1:
                        $ctx.state = 2;
                        return take(ch);
                    case 2:
                        value = $ctx.sent;
                        $ctx.state = 4;
                        break;
                    case 4:
                        $ctx.state = (value === CLOSED) ? 5 : 7;
                        break;
                    case 5:
                        $ctx.returnValue = result;
                        $ctx.state = -2;
                        break;
                    case 7:
                        result = f(result, value);
                        $ctx.state = 12;
                        break;
                    default:
                        return $ctx.end();
                    }
            }, $__1, this);
        }), [], true);
    }
    function onto(ch, coll, keepOpen) {
        return go($traceurRuntime.initGeneratorFunction(function $__1() {
            var length,
                i;
            return $traceurRuntime.createGeneratorInstance(function($ctx) {
                while (true)
                    switch ($ctx.state) {
                    case 0:
                        length = coll.length;
                        $ctx.state = 9;
                        break;
                    case 9:
                        i = 0;
                        $ctx.state = 7;
                        break;
                    case 7:
                        $ctx.state = (i < length) ? 1 : 5;
                        break;
                    case 4:
                        i++;
                        $ctx.state = 7;
                        break;
                    case 1:
                        $ctx.state = 2;
                        return put(ch, coll[i]);
                    case 2:
                        $ctx.maybeThrow();
                        $ctx.state = 4;
                        break;
                    case 5:
                        if (!keepOpen) {
                            ch.close();
                        }
                        $ctx.state = -2;
                        break;
                    default:
                        return $ctx.end();
                    }
            }, $__1, this);
        }));
    }
    function fromColl(coll) {
        var ch = chan(coll.length);
        onto(ch, coll);
        return ch;
    }
    function map(f, chs, bufferOrN) {
        var out = chan(bufferOrN);
        var length = chs.length;
        var values = new Array(length);
        var dchan = chan(1);
        var dcount;
        var dcallbacks = new Array(length);
        for (var i = 0; i < length; i++) {
            dcallbacks[i] = (function(i) {
                return function(value) {
                    values[i] = value;
                    dcount--;
                    if (dcount === 0) {
                        putAsync(dchan, values.slice(0));
                    }
                };
            }(i));
        }
        go($traceurRuntime.initGeneratorFunction(function $__1() {
            var i,
                values;
            return $traceurRuntime.createGeneratorInstance(function($ctx) {
                while (true)
                    switch ($ctx.state) {
                    case 0:
                        $ctx.state = (true) ? 17 : -2;
                        break;
                    case 17:
                        dcount = length;
                        for (i = 0; i < length; i++) {
                            try {
                                takeAsync(chs[i], dcallbacks[i]);
                            } catch (e) {
                                dcount--;
                            }
                        }
                        $ctx.state = 18;
                        break;
                    case 18:
                        $ctx.state = 2;
                        return take(dchan);
                    case 2:
                        values = $ctx.sent;
                        $ctx.state = 4;
                        break;
                    case 4:
                        i = 0;
                        $ctx.state = 12;
                        break;
                    case 12:
                        $ctx.state = (i < length) ? 9 : 10;
                        break;
                    case 6:
                        i++;
                        $ctx.state = 12;
                        break;
                    case 9:
                        $ctx.state = (values[i] === CLOSED) ? 7 : 6;
                        break;
                    case 7:
                        out.close();
                        $ctx.state = 8;
                        break;
                    case 8:
                        $ctx.state = -2;
                        break;
                    case 10:
                        $ctx.state = 14;
                        return put(out, f.apply(null, values));
                    case 14:
                        $ctx.maybeThrow();
                        $ctx.state = 0;
                        break;
                    default:
                        return $ctx.end();
                    }
            }, $__1, this);
        }));
        return out;
    }
    function merge(chs, bufferOrN) {
        var out = chan(bufferOrN);
        var actives = chs.slice(0);
        go($traceurRuntime.initGeneratorFunction(function $__1() {
            var r,
                value,
                i;
            return $traceurRuntime.createGeneratorInstance(function($ctx) {
                while (true)
                    switch ($ctx.state) {
                    case 0:
                        $ctx.state = (true) ? 3 : 19;
                        break;
                    case 3:
                        $ctx.state = (actives.length === 0) ? 19 : 2;
                        break;
                    case 2:
                        $ctx.state = 5;
                        return alts(actives);
                    case 5:
                        r = $ctx.sent;
                        $ctx.state = 7;
                        break;
                    case 7:
                        value = r.value;
                        $ctx.state = 18;
                        break;
                    case 18:
                        $ctx.state = (value === CLOSED) ? 10 : 9;
                        break;
                    case 10:
                        i = actives.indexOf(r.channel);
                        actives.splice(i, 1);
                        $ctx.state = 0;
                        break;
                    case 9:
                        $ctx.state = 14;
                        return put(out, value);
                    case 14:
                        $ctx.maybeThrow();
                        $ctx.state = 0;
                        break;
                    case 19:
                        out.close();
                        $ctx.state = -2;
                        break;
                    default:
                        return $ctx.end();
                    }
            }, $__1, this);
        }));
        return out;
    }
    function into(coll, ch) {
        var result = coll.slice(0);
        return reduce(function(result, item) {
            result.push(item);
            return result;
        }, result, ch);
    }
    function takeN(n, ch, bufferOrN) {
        var out = chan(bufferOrN);
        go($traceurRuntime.initGeneratorFunction(function $__1() {
            var i,
                value;
            return $traceurRuntime.createGeneratorInstance(function($ctx) {
                while (true)
                    switch ($ctx.state) {
                    case 0:
                        i = 0;
                        $ctx.state = 14;
                        break;
                    case 14:
                        $ctx.state = (i < n) ? 1 : 12;
                        break;
                    case 11:
                        i++;
                        $ctx.state = 14;
                        break;
                    case 1:
                        $ctx.state = 2;
                        return take(ch);
                    case 2:
                        value = $ctx.sent;
                        $ctx.state = 4;
                        break;
                    case 4:
                        $ctx.state = (value === CLOSED) ? 12 : 6;
                        break;
                    case 6:
                        $ctx.state = 9;
                        return put(out, value);
                    case 9:
                        $ctx.maybeThrow();
                        $ctx.state = 11;
                        break;
                    case 12:
                        out.close();
                        $ctx.state = -2;
                        break;
                    default:
                        return $ctx.end();
                    }
            }, $__1, this);
        }));
        return out;
    }
    var NOTHING = {};
    function unique(ch, bufferOrN) {
        var out = chan(bufferOrN);
        var last = NOTHING;
        go($traceurRuntime.initGeneratorFunction(function $__1() {
            var value;
            return $traceurRuntime.createGeneratorInstance(function($ctx) {
                while (true)
                    switch ($ctx.state) {
                    case 0:
                        $ctx.state = (true) ? 1 : 17;
                        break;
                    case 1:
                        $ctx.state = 2;
                        return take(ch);
                    case 2:
                        value = $ctx.sent;
                        $ctx.state = 4;
                        break;
                    case 4:
                        $ctx.state = (value === CLOSED) ? 17 : 6;
                        break;
                    case 6:
                        $ctx.state = (value === last) ? 0 : 9;
                        break;
                    case 9:
                        last = value;
                        $ctx.state = 16;
                        break;
                    case 16:
                        $ctx.state = 12;
                        return put(out, value);
                    case 12:
                        $ctx.maybeThrow();
                        $ctx.state = 0;
                        break;
                    case 17:
                        out.close();
                        $ctx.state = -2;
                        break;
                    default:
                        return $ctx.end();
                    }
            }, $__1, this);
        }));
        return out;
    }
    function partitionBy(f, ch, bufferOrN) {
        var out = chan(bufferOrN);
        var part = [];
        var last = NOTHING;
        go($traceurRuntime.initGeneratorFunction(function $__1() {
            var value,
                newItem;
            return $traceurRuntime.createGeneratorInstance(function($ctx) {
                while (true)
                    switch ($ctx.state) {
                    case 0:
                        $ctx.state = (true) ? 1 : -2;
                        break;
                    case 1:
                        $ctx.state = 2;
                        return take(ch);
                    case 2:
                        value = $ctx.sent;
                        $ctx.state = 4;
                        break;
                    case 4:
                        $ctx.state = (value === CLOSED) ? 9 : 23;
                        break;
                    case 9:
                        $ctx.state = (part.length > 0) ? 5 : 8;
                        break;
                    case 5:
                        $ctx.state = 6;
                        return put(out, part);
                    case 6:
                        $ctx.maybeThrow();
                        $ctx.state = 8;
                        break;
                    case 8:
                        out.close();
                        $ctx.state = -2;
                        break;
                    case 23:
                        newItem = f(value);
                        $ctx.state = 24;
                        break;
                    case 24:
                        $ctx.state = (newItem === last || last === NOTHING) ? 20 : 14;
                        break;
                    case 20:
                        part.push(value);
                        $ctx.state = 21;
                        break;
                    case 14:
                        $ctx.state = 15;
                        return put(out, part);
                    case 15:
                        $ctx.maybeThrow();
                        $ctx.state = 17;
                        break;
                    case 17:
                        part = [value];
                        $ctx.state = 21;
                        break;
                    case 21:
                        last = newItem;
                        $ctx.state = 0;
                        break;
                    default:
                        return $ctx.end();
                    }
            }, $__1, this);
        }));
        return out;
    }
    function partition(n, ch, bufferOrN) {
        var out = chan(bufferOrN);
        go($traceurRuntime.initGeneratorFunction(function $__1() {
            var part,
                i,
                value;
            return $traceurRuntime.createGeneratorInstance(function($ctx) {
                while (true)
                    switch ($ctx.state) {
                    case 0:
                        $ctx.state = (true) ? 24 : -2;
                        break;
                    case 24:
                        part = new Array(n);
                        $ctx.state = 25;
                        break;
                    case 25:
                        i = 0;
                        $ctx.state = 19;
                        break;
                    case 19:
                        $ctx.state = (i < n) ? 1 : 17;
                        break;
                    case 16:
                        i++;
                        $ctx.state = 19;
                        break;
                    case 1:
                        $ctx.state = 2;
                        return take(ch);
                    case 2:
                        value = $ctx.sent;
                        $ctx.state = 4;
                        break;
                    case 4:
                        $ctx.state = (value === CLOSED) ? 9 : 11;
                        break;
                    case 9:
                        $ctx.state = (i > 0) ? 5 : 8;
                        break;
                    case 5:
                        $ctx.state = 6;
                        return put(out, part.slice(0, i));
                    case 6:
                        $ctx.maybeThrow();
                        $ctx.state = 8;
                        break;
                    case 8:
                        out.close();
                        $ctx.state = 13;
                        break;
                    case 13:
                        $ctx.state = -2;
                        break;
                    case 11:
                        part[i] = value;
                        $ctx.state = 16;
                        break;
                    case 17:
                        $ctx.state = 21;
                        return put(out, part);
                    case 21:
                        $ctx.maybeThrow();
                        $ctx.state = 0;
                        break;
                    default:
                        return $ctx.end();
                    }
            }, $__1, this);
        }));
        return out;
    }
    var genId = (function() {
        var i = 0;
        return function() {
            i++;
            return "" + i;
        };
    })();
    var ID_ATTR = "__csp_channel_id";
    function len(obj) {
        var count = 0;
        for (var p in obj) {
            count++;
        }
        return count;
    }
    function chanId(ch) {
        var id = ch[ID_ATTR];
        if (id === undefined) {
            id = ch[ID_ATTR] = genId();
        }
        return id;
    }
    var Mult = function(ch) {
        this.taps = {};
        this.ch = ch;
    };
    var Tap = function(channel, keepOpen) {
        this.channel = channel;
        this.keepOpen = keepOpen;
    };
    Mult.prototype.muxch = function() {
        return this.ch;
    };
    Mult.prototype.tap = function(ch, keepOpen) {
        var id = chanId(ch);
        this.taps[id] = new Tap(ch, keepOpen);
    };
    Mult.prototype.untap = function(ch) {
        delete this.taps[chanId(ch)];
    };
    Mult.prototype.untapAll = function() {
        this.taps = {};
    };
    function mult(ch) {
        var m = new Mult(ch);
        var dchan = chan(1);
        var dcount;
        function makeDoneCallback(tap) {
            return function(stillOpen) {
                dcount--;
                if (dcount === 0) {
                    putAsync(dchan, true);
                }
                if (!stillOpen) {
                    m.untap(tap.channel);
                }
            };
        }
        go($traceurRuntime.initGeneratorFunction(function $__1() {
            var value,
                id,
                t,
                taps,
                $__4,
                $__5,
                $__6,
                $__7,
                initDcount,
                $__8,
                $__9,
                $__10,
                $__11;
            return $traceurRuntime.createGeneratorInstance(function($ctx) {
                while (true)
                    switch ($ctx.state) {
                    case 0:
                        $ctx.state = (true) ? 1 : -2;
                        break;
                    case 1:
                        $ctx.state = 2;
                        return take(ch);
                    case 2:
                        value = $ctx.sent;
                        $ctx.state = 4;
                        break;
                    case 4:
                        taps = m.taps;
                        $ctx.state = 40;
                        break;
                    case 40:
                        $ctx.state = (value === CLOSED) ? 15 : 18;
                        break;
                    case 15:
                        $__4 = [];
                        $__5 = taps;
                        for ($__6 in $__5)
                            $__4.push($__6);
                        $ctx.state = 16;
                        break;
                    case 16:
                        $__7 = 0;
                        $ctx.state = 14;
                        break;
                    case 14:
                        $ctx.state = ($__7 < $__4.length) ? 8 : 12;
                        break;
                    case 11:
                        $__7++;
                        $ctx.state = 14;
                        break;
                    case 8:
                        id = $__4[$__7];
                        $ctx.state = 9;
                        break;
                    case 9:
                        $ctx.state = (!(id in $__5)) ? 11 : 6;
                        break;
                    case 6:
                        t = taps[id];
                        if (!t.keepOpen) {
                            t.channel.close();
                        }
                        $ctx.state = 11;
                        break;
                    case 12:
                        m.untapAll();
                        $ctx.state = -2;
                        break;
                    case 18:
                        dcount = len(taps);
                        initDcount = dcount;
                        $ctx.state = 42;
                        break;
                    case 42:
                        $__8 = [];
                        $__9 = taps;
                        for ($__10 in $__9)
                            $__8.push($__10);
                        $ctx.state = 33;
                        break;
                    case 33:
                        $__11 = 0;
                        $ctx.state = 31;
                        break;
                    case 31:
                        $ctx.state = ($__11 < $__8.length) ? 25 : 29;
                        break;
                    case 28:
                        $__11++;
                        $ctx.state = 31;
                        break;
                    case 25:
                        id = $__8[$__11];
                        $ctx.state = 26;
                        break;
                    case 26:
                        $ctx.state = (!(id in $__9)) ? 28 : 23;
                        break;
                    case 23:
                        t = taps[id];
                        putAsync(t.channel, value, makeDoneCallback(t));
                        $ctx.state = 28;
                        break;
                    case 29:
                        $ctx.state = (initDcount > 0) ? 34 : 0;
                        break;
                    case 34:
                        $ctx.state = 35;
                        return take(dchan);
                    case 35:
                        $ctx.maybeThrow();
                        $ctx.state = 0;
                        break;
                    default:
                        return $ctx.end();
                    }
            }, $__1, this);
        }));
        return m;
    }
    mult.tap = function tap(m, ch, keepOpen) {
        m.tap(ch, keepOpen);
        return ch;
    };
    mult.untap = function untap(m, ch) {
        m.untap(ch);
    };
    mult.untapAll = function untapAll(m) {
        m.untapAll();
    };
    var Mix = function(ch) {
        this.ch = ch;
        this.stateMap = {};
        this.change = chan();
        this.soloMode = mix.MUTE;
    };
    Mix.prototype._changed = function() {
        putAsync(this.change, true);
    };
    Mix.prototype._getAllState = function() {
        var allState = {};
        var stateMap = this.stateMap;
        var solos = [];
        var mutes = [];
        var pauses = [];
        var reads;
        for (var id in stateMap) {
            var chanData = stateMap[id];
            var state = chanData.state;
            var channel = chanData.channel;
            if (state[mix.SOLO]) {
                solos.push(channel);
            }
            if (state[mix.MUTE]) {
                mutes.push(channel);
            }
            if (state[mix.PAUSE]) {
                pauses.push(channel);
            }
        }
        var i,
            n;
        if (this.soloMode === mix.PAUSE && solos.length > 0) {
            n = solos.length;
            reads = new Array(n + 1);
            for (i = 0; i < n; i++) {
                reads[i] = solos[i];
            }
            reads[n] = this.change;
        } else {
            reads = [];
            for (id in stateMap) {
                chanData = stateMap[id];
                channel = chanData.channel;
                if (pauses.indexOf(channel) < 0) {
                    reads.push(channel);
                }
            }
            reads.push(this.change);
        }
        return {
            solos: solos,
            mutes: mutes,
            reads: reads
        };
    };
    Mix.prototype.admix = function(ch) {
        this.stateMap[chanId(ch)] = {
            channel: ch,
            state: {}
        };
        this._changed();
    };
    Mix.prototype.unmix = function(ch) {
        delete this.stateMap[chanId(ch)];
        this._changed();
    };
    Mix.prototype.unmixAll = function() {
        this.stateMap = {};
        this._changed();
    };
    Mix.prototype.toggle = function(updateStateList) {
        var length = updateStateList.length;
        for (var i = 0; i < length; i++) {
            var ch = updateStateList[i][0];
            var id = chanId(ch);
            var updateState = updateStateList[i][1];
            var chanData = this.stateMap[id];
            if (!chanData) {
                chanData = this.stateMap[id] = {
                    channel: ch,
                    state: {}
                };
            }
            for (var mode in updateState) {
                chanData.state[mode] = updateState[mode];
            }
        }
        this._changed();
    };
    Mix.prototype.setSoloMode = function(mode) {
        if (VALID_SOLO_MODES.indexOf(mode) < 0) {
            throw new Error("Mode must be one of: ", VALID_SOLO_MODES.join(", "));
        }
        this.soloMode = mode;
        this._changed();
    };
    function mix(out) {
        var m = new Mix(out);
        go($traceurRuntime.initGeneratorFunction(function $__1() {
            var state,
                result,
                value,
                channel,
                solos,
                stillOpen;
            return $traceurRuntime.createGeneratorInstance(function($ctx) {
                while (true)
                    switch ($ctx.state) {
                    case 0:
                        state = m._getAllState();
                        $ctx.state = 29;
                        break;
                    case 29:
                        $ctx.state = (true) ? 1 : -2;
                        break;
                    case 1:
                        $ctx.state = 2;
                        return alts(state.reads);
                    case 2:
                        result = $ctx.sent;
                        $ctx.state = 4;
                        break;
                    case 4:
                        value = result.value;
                        channel = result.channel;
                        $ctx.state = 24;
                        break;
                    case 24:
                        $ctx.state = (value === CLOSED) ? 7 : 6;
                        break;
                    case 7:
                        delete m.stateMap[chanId(channel)];
                        state = m._getAllState();
                        $ctx.state = 29;
                        break;
                    case 6:
                        $ctx.state = (channel === m.change) ? 12 : 11;
                        break;
                    case 12:
                        state = m._getAllState();
                        $ctx.state = 29;
                        break;
                    case 11:
                        solos = state.solos;
                        $ctx.state = 26;
                        break;
                    case 26:
                        $ctx.state = (solos.indexOf(channel) > -1 || (solos.length && !(m.mutes.indexOf(channel) > -1))) ? 15 : 29;
                        break;
                    case 15:
                        $ctx.state = 16;
                        return put(out, value);
                    case 16:
                        stillOpen = $ctx.sent;
                        $ctx.state = 18;
                        break;
                    case 18:
                        $ctx.state = (!stillOpen) ? -2 : 29;
                        break;
                    default:
                        return $ctx.end();
                    }
            }, $__1, this);
        }));
        return m;
    }
    mix.MUTE = "mute";
    mix.PAUSE = "pause";
    mix.SOLO = "solo";
    var VALID_SOLO_MODES = [mix.MUTE, mix.PAUSE];
    mix.add = function admix(m, ch) {
        m.admix(ch);
    };
    mix.remove = function unmix(m, ch) {
        m.unmix(ch);
    };
    mix.removeAll = function unmixAll(m) {
        m.unmixAll();
    };
    mix.toggle = function toggle(m, updateStateList) {
        m.toggle(updateStateList);
    };
    mix.setSoloMode = function setSoloMode(m, mode) {
        m.setSoloMode(mode);
    };
    function constantlyNull() {
        return null;
    }
    var Pub = function(ch, topicFn, bufferFn) {
        this.ch = ch;
        this.topicFn = topicFn;
        this.bufferFn = bufferFn;
        this.mults = {};
    };
    Pub.prototype._ensureMult = function(topic) {
        var m = this.mults[topic];
        var bufferFn = this.bufferFn;
        if (!m) {
            m = this.mults[topic] = mult(chan(bufferFn(topic)));
        }
        return m;
    };
    Pub.prototype.sub = function(topic, ch, keepOpen) {
        var m = this._ensureMult(topic);
        return mult.tap(m, ch, keepOpen);
    };
    Pub.prototype.unsub = function(topic, ch) {
        var m = this.mults[topic];
        if (m) {
            mult.untap(m, ch);
        }
    };
    Pub.prototype.unsubAll = function(topic) {
        if (topic === undefined) {
            this.mults = {};
        } else {
            delete this.mults[topic];
        }
    };
    function pub(ch, topicFn, bufferFn) {
        bufferFn = bufferFn || constantlyNull;
        var p = new Pub(ch, topicFn, bufferFn);
        go($traceurRuntime.initGeneratorFunction(function $__1() {
            var value,
                mults,
                topic,
                $__12,
                $__13,
                $__14,
                $__15,
                m,
                stillOpen;
            return $traceurRuntime.createGeneratorInstance(function($ctx) {
                while (true)
                    switch ($ctx.state) {
                    case 0:
                        $ctx.state = (true) ? 1 : -2;
                        break;
                    case 1:
                        $ctx.state = 2;
                        return take(ch);
                    case 2:
                        value = $ctx.sent;
                        $ctx.state = 4;
                        break;
                    case 4:
                        mults = p.mults;
                        $ctx.state = 28;
                        break;
                    case 28:
                        $ctx.state = (value === CLOSED) ? 15 : 18;
                        break;
                    case 15:
                        $__12 = [];
                        $__13 = mults;
                        for ($__14 in $__13)
                            $__12.push($__14);
                        $ctx.state = 16;
                        break;
                    case 16:
                        $__15 = 0;
                        $ctx.state = 14;
                        break;
                    case 14:
                        $ctx.state = ($__15 < $__12.length) ? 8 : -2;
                        break;
                    case 11:
                        $__15++;
                        $ctx.state = 14;
                        break;
                    case 8:
                        topic = $__12[$__15];
                        $ctx.state = 9;
                        break;
                    case 9:
                        $ctx.state = (!(topic in $__13)) ? 11 : 6;
                        break;
                    case 6:
                        mults[topic].muxch().close();
                        $ctx.state = 11;
                        break;
                    case 18:
                        topic = topicFn(value);
                        m = mults[topic];
                        $ctx.state = 30;
                        break;
                    case 30:
                        $ctx.state = (m) ? 20 : 0;
                        break;
                    case 20:
                        $ctx.state = 21;
                        return put(m.muxch(), value);
                    case 21:
                        stillOpen = $ctx.sent;
                        $ctx.state = 23;
                        break;
                    case 23:
                        if (!stillOpen) {
                            delete mults[topic];
                        }
                        $ctx.state = 0;
                        break;
                    default:
                        return $ctx.end();
                    }
            }, $__1, this);
        }));
        return p;
    }
    pub.sub = function sub(p, topic, ch, keepOpen) {
        return p.sub(topic, ch, keepOpen);
    };
    pub.unsub = function unsub(p, topic, ch) {
        p.unsub(topic, ch);
    };
    pub.unsubAll = function unsubAll(p, topic) {
        p.unsubAll(topic);
    };
    
    return {
        mapFrom: mapFrom,
        mapInto: mapInto,
        filterFrom: filterFrom,
        filterInto: filterInto,
        removeFrom: removeFrom,
        removeInto: removeInto,
        mapcatFrom: mapcatFrom,
        mapcatInto: mapcatInto,
        pipe: pipe,
        split: split,
        reduce: reduce,
        onto: onto,
        fromColl: fromColl,
        map: map,
        merge: merge,
        into: into,
        take: takeN,
        unique: unique,
        partition: partition,
        partitionBy: partitionBy,
        mult: mult,
        mix: mix,
        pub: pub
    };
})();

csp = {
    buffers: buffers,
    spawn: core.spawn,
    go: core.go,
    chan: core.chan,
    DEFAULT: select.DEFAULT,
    CLOSED: channels.CLOSED,
    put: process.put,
    take: process.take,
    sleep: process.sleep,
    alts: process.alts,
    putAsync: process.put_then_callback,
    takeAsync: process.take_then_callback,
    timeout: timers.timeout
};
