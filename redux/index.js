var stack = [], push = [].push, token = {}

function Cadence (cadence, steps, callback) {
    this.finalizers = cadence.finalizers
    this.self = cadence.self
    this.steps = steps
    this.callback = callback
    this.loop = false
}

Cadence.prototype.done = function (vargs) {
    if (this.finalizers.length == 0) {
        this.callback.apply(null, vargs)
    } else {
        finalize(this, [], this.callback, vargs)
    }
}

function Step (cadence, index, vargs) {
    this.cadence = cadence
    this.results = []
    this.errors = []
    this.called = 0
    this.index = index
    this.sync = true
    this.next = null
    this.vargs = vargs
}

Step.prototype.callback = function (result, vargs) {
    var error = vargs.shift()
    if (error == null) {
        result.vargs = vargs
    } else {
        this.errors.push(error)
    }
    if (++this.called === this.results.length) {
        if (this.next == null) {
            this.sync = true
        } else {
            invoke(this.next)
        }
    }
}

Step.prototype.createCallback = function () {
    var self = this
    var result = { vargs: [], starter: null }

    self.results.push(result)
    self.sync = false

    return callback

    function callback () {
        var I = arguments.length
        var vargs = new Array(I)
        for (var i = 0; i < I; i++) {
            vargs[i] = arguments[i]
        }
        self.callback(result, vargs)

        return

        // This try/catch will prevent V8 from marking this function of
        // optimization because it will only ever run once.
        /* istanbul ignore next */
        try {} catch(e) {}
    }
}

Step.prototype.createCadence = function (vargs) {
    var self = this

    var callback = this.createCallback()

    var result = this.results[this.results.length - 1]

    var cadence = new Cadence(self.cadence, vargs, callback)

    var step = new Step(cadence, -1, [])

    return result.starter = starter

    function starter () {
        var I = arguments.length
        var vargs = new Array(I)
        for (var i = 0; i < I; i++) {
            vargs[i] = arguments[i]
        }
        return self.starter(step, result, vargs)
    }
}

Step.prototype.starter = function (step, result, vargs) {
    if (vargs[0] === token) {
        invoke(step)
    } else {
        var count = 0, cadence = step.cadence

        label.loopy = token
        label.deprecated = true

        step.repeat = false
        step.cadence.loop = true
        push.apply(step.vargs, vargs)

        label.continue = { loopy: token, repeat: true, loop: false, cadence: cadence }
        label.break = { loopy: token, repeat: false, loop: false, cadence: cadence }

        return label

        function label () {
            throw new Error('deprecated: use `label.continue`.')
        }
    }
}

function async () {
    var step = stack[stack.length - 1]
    var I = arguments.length
    if (I) {
        var vargs = new Array(I)
        for (var i = 0; i < I; i++) {
            vargs[i] = arguments[i]
        }
        return step.createCadence(vargs)
    } else {
        return step.createCallback()
    }
}

async.__defineGetter__('self', function () {
    return stack[stack.length - 1].cadence.self
})

async.continue = { loopy: token, repeat: true, loop: false }
async.break = { loopy: token, repeat: false, loop: false }

function call (fn, self, vargs) {
    try {
        var ret = fn.apply(self, vargs)
    } catch (e) {
        return [ ret, e ]
    }
    return [ ret ]
}

function rescue (step) {
    if (step.errors.length === 0) {
        invoke(step)
    } else {
        var error = step.errors.shift()

        execute(step.cadence.self, [
            step.catcher,
            function () {
                var I = arguments.length
                var vargs = new Array(I)
                for (var i = 0; i < I; i++) {
                    vargs[i] = arguments[i]
                }
                if (vargs[0] !== error) {
                    step.vargs = vargs
                    step.results.length = 0
                }
            }
        ], [ error, done ])

        function done (error) {
            if (error) {
                step.cadence.done([ error ])
            } else {
                rescue(step)
            }
        }
    }
}

function invoke (step) {
    for (;;) {
        var vargs, cadence = step.cadence, steps = cadence.steps

        if (step.errors.length) {
            if (step.catcher) {
                rescue(step)
            } else {
                cadence.done([ step.errors[0] ])
            }
            break
        }

        if (step.results.length == 0) {
            vargs = step.vargs
            if (vargs[0] && vargs[0].loopy === token) {
                var label = vargs.shift()
                if (label.deprecated) {
                    step.errors.push(new Error('deprecated: use `label.break`.'))
                    continue
                }
                if (label.cadence) {
                    cadence = step.cadence = label.cadence
                    steps = cadence.steps
                }
                step.index = label.repeat ? -1 : steps.length - 1
                cadence.loop = label.loop
            }
        } else {
            vargs = []
            for (var i = 0, I = step.results.length; i < I; i++) {
                var vargs_ = step.results[i].vargs
                for (var j = 0, J = vargs_.length; j < J; j++) {
                    vargs.push(vargs_[j])
                }
            }
        }

        step = new Step(step.cadence, step.index + 1, vargs)

        if (step.index == steps.length) {
            if (cadence.loop) {
                step.index = 0
            } else {
                if (vargs.length !== 0) {
                    vargs.unshift(null)
                }
                cadence.done(vargs)
                break
            }
        }

        var fn = steps[step.index]

        if (Array.isArray(fn)) {
            if (fn.length === 1) {
                cadence.finalizers.push({ steps: fn, vargs: vargs })
                continue
            } else if (fn.length === 2) {
                step.catcher = fn[1]
                fn = fn[0]
            } else if (fn.length === 3) {
                var filter = fn
                step.catcher = function (error) {
                    if (filter[1].test(error.code || error.message)) {
                        return filter[2](error)
                    } else {
                        throw error
                    }
                }
                fn = fn[0]
            } else {
                step.vargs = [ step.vargs ]
                continue
            }
        }

        stack.push(step)

        var ret = call(fn, cadence.self, vargs)
               // ^^^^

        stack.pop()

        if (ret.length === 2) {
            step.errors.push(ret[1])
            step.vargs = vargs
            step.sync = true
        } else {
            for (var i = 0, I = step.results.length; i < I; i++) {
                var result = step.results[i]
                if (result.starter) {
                    result.starter(token)
                }
            }
            step.vargs = [].concat(ret[0] === void(0) ? vargs : ret[0])
        }

        if (!step.sync) {
            step.next = step
            break
        }
    }
}

function finalize (cadence, errors, callback, vargs) {
    if (cadence.finalizers.length == 0) {
        if (errors.length === 0) {
            callback.apply(null, vargs)
        } else {
            callback.apply(null, [ errors[0] ])
        }
    } else {
        var finalizer = cadence.finalizers.pop()
        execute(cadence.self, finalizer.steps, finalizer.vargs.concat(done))
    }
    function done (error) {
        if (error) {
            errors.push(error)
        }
        finalize(cadence, errors, callback, vargs)
    }
}

function execute (self, steps, vargs) {
    var callback = vargs.pop()

    var cadence = new Cadence({ finalizers: [], self: self }, steps, callback)

    var step = new Step(cadence, -1, vargs)

    // async.self = self

    invoke(step)
}

function cadence () {
    var I = arguments.length
    var vargs = new Array(I)
    for (var i = 0; i < I; i++) {
        vargs[i] = arguments[i]
    }
    return _cadence(vargs)
}

function _cadence (steps) {
    var f

    // Preserving arity costs next to nothing; the call to `execute` in
    // these functions will be inlined. The airty function itself will never
    // be inlined because it is in a different context than that of our
    // dear user, but it will be compiled.
    switch (steps[0].length) {
    case 0:
        f = function () {
            var I = arguments.length
            var vargs = new Array(I + 1)
            vargs[0] = async
            for (var i = 0; i < I; i++) {
                vargs[i + 1] = arguments[i]
            }
            execute(this, steps, vargs)
        }
        break
    case 1:
        f = function (one) {
            var I = arguments.length
            var vargs = new Array(I + 1)
            vargs[0] = async
            for (var i = 0; i < I; i++) {
                vargs[i + 1] = arguments[i]
            }
            execute(this, steps, vargs)
        }
        break
    case 2:
        f = function (one, two) {
            var I = arguments.length
            var vargs = new Array(I + 1)
            vargs[0] = async
            for (var i = 0; i < I; i++) {
                vargs[i + 1] = arguments[i]
            }
            execute(this, steps, vargs)
        }
        break
    case 3:
        f = function (one, two, three) {
            var I = arguments.length
            var vargs = new Array(I + 1)
            vargs[0] = async
            for (var i = 0; i < I; i++) {
                vargs[i + 1] = arguments[i]
            }
            execute(this, steps, vargs)
        }
        break
    case 4:
        f = function (one, two, three, four) {
            var I = arguments.length
            var vargs = new Array(I + 1)
            vargs[0] = async
            for (var i = 0; i < I; i++) {
                vargs[i + 1] = arguments[i]
            }
            execute(this, steps, vargs)
        }
        break
    default:
        // Avert your eyes if you're squeamish.
        var args = []
        for (var i = 0, I = steps[0].length; i < I; i++) {
            args[i] = '_' + i
        }
        var f = (new Function('execute', 'steps', 'async', '                \n\
            return function (' + args.join(',') + ') {                      \n\
                var I = arguments.length                                    \n\
                var vargs = new Array(I + 1)                                \n\
                vargs[0] = async                                            \n\
                for (var i = 0; i < I; i++) {                               \n\
                    vargs[i + 1] = arguments[i]                             \n\
                }                                                           \n\
                execute(this, steps, vargs)                                 \n\
            }                                                               \n\
       '))(execute, steps, async)
    }

    f.toString = function () { return steps[0].toString() }

    f.isCadence = true

    return f
}

function variadic (f) {
    return function () {
        var I = arguments.length
        var vargs = new Array(I)
        for (var i = 0; i < I; i++) {
            vargs[i] = arguments[i]
        }
        return f.call(this, vargs)
    }
}

cadence(function (async) {
    async.forEach = variadic(function (steps) {
        var async = this
        return variadic(function (vargs) {
            var loop, array = vargs.shift(), index = -1
            steps.unshift(variadic(function (vargs) {
                index++
                if (index === array.length) return [ loop.break ].concat(vargs)
                return [ array[index], index ].concat(vargs)
            }))
            return loop = async.apply(null, steps).apply(null, vargs)
        })
    })
    async.map = variadic(function (steps) {
        var async = this
        return variadic(function (vargs) {
            var loop, array = vargs.shift(), index = -1, gather = []
            steps.unshift(variadic(function (vargs) {
                index++
                if (index === array.length) return [ loop.break, gather ]
                return [ array[index], index ].concat(vargs)
            }))
            steps.push(variadic(function (vargs) {
                gather.push.apply(gather, vargs)
            }))
            return loop = async.apply(null, steps).apply(null, vargs)
        })
    })
})(function () {})

function Sink (async, self, ee) {
    this._async = async
    this._self = self
    this._ee = ee
    this._listeners = []
    this._callback = async()
}

Sink.prototype._invoke = function (fn, vargs) {
    try {
        var ret = fn.apply(this._self, vargs)
        return [ ret ]
    } catch (e) {
        return [ ret, e ]
    }
}

Sink.prototype._register = function (event, fn) {
    this._ee.on(event, fn)
    this._listeners.push({ event: event, fn: fn })
}

Sink.prototype.error = function (filter) {
    this._register('error', function (error) {
        if (filter) {
            error = this._invoke(filter, [ error ])[1]
        }
        if (error) {
            this._terminate([ error ])
        }
    }.bind(this))
    return this
}

Sink.prototype.end = function (event) {
    this._register(event, function () {
        var I = arguments.length
        var vargs = new Array(I)
        for (var i = 0; i < I; i++) {
            vargs[i] = arguments[i]
        }
        this._terminate([ null ].concat(vargs))
    }.bind(this))
    return this
}

Sink.prototype._terminate = function (vargs) {
    for (var i = 0, I = this._listeners.length; i < I; i++) {
        var listener = this._listeners[i]
        this._ee.removeListener(listener.event, listener.fn)
    }
    this._callback.apply(null, vargs)
}

Sink.prototype.on = function (event, listener) {
    this._register(event, function () {
        var I = arguments.length
        var vargs = new Array(I)
        for (var i = 0; i < I; i++) {
            vargs[i] = arguments[i]
        }
        var ret = this._invoke(listener, vargs)
        if (ret.length === 2) {
            this._terminate([ ret[1] ])
        }
    }.bind(this))
    return this
}

cadence(function (async) {
    async.ee = function (ee) {
        var async = this
        return new Sink(this, async.self, ee)
    }
})(function () {})

module.exports = cadence