var ok = require('assert').ok
var cadence = require('../../redux')
var _cadence = require('../../_redux')
var Benchmark = require('benchmark')

var suite = new Benchmark.Suite('loop', { minSamples: 100 })

var COUNT = 1024 * 4

var m = cadence(function () { return 1 })

function inc (count, callback) {
    callback(null, count + 1)
}

function body (async) {
    async(function () {
        var callbacks = []
        for (var i = 0; i < 1024; i++) {
            callbacks.push(async())
        }
        callbacks.reverse()
        for (var i = 0; i < 1024; i++) {
            callbacks[i](null, i)
        }
    }, [], function (gathered) {
        if (gathered.length != 1024) {
            throw new Error
        }
    })
}

var m = cadence(body)

function fn () {
    m(function (error, result) {
    })
}

var m_ = _cadence(body)

function fn_ () {
    m_(function (error, result) {
    })
}

for (var i = 1; i <= 4; i++) {
    suite.add({
        name: ' cadence loop ' + i,
        fn: fn
    })

    suite.add({
        name: '_cadence loop ' + i,
        fn: fn_
    })
}

suite.on('cycle', function(event) {
    console.log(String(event.target));
})

suite.on('complete', function() {
    console.log('Fastest is ' + this.filter('fastest').pluck('name'));
})

suite.run()
