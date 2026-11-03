// TEMP: timing beacons for profiling on slow TVs. The proxy container logs /perf requests.
const sessionId = Math.random().toString(36).slice(2, 8);
const WATCHDOG_INTERVAL = 250;
const GAP_THRESHOLD = 500;

let lastMark = 'boot';
let observers = 0;
let observeCalls = 0;
let disconnectCalls = 0;

const now = () => Math.round(window.performance.now());

function send(name: string, extra?: string | number) {
    let url = '/perf?s=' + sessionId
        + '&m=' + encodeURIComponent(name)
        + '&t=' + now()
        + '&io=' + observers + '/' + observeCalls + '/' + disconnectCalls;
    if (extra != null) url += '&x=' + encodeURIComponent(String(extra));
    new Image().src = url;
}

export function mark(name: string, extra?: string | number) {
    lastMark = name;
    send(name, extra);
}

const IO = window.IntersectionObserver as (typeof IntersectionObserver & { prototype: { __perfCounted?: boolean } }) | undefined;
if (IO) {
    const observe = IO.prototype.observe;
    const disconnect = IO.prototype.disconnect;
    IO.prototype.observe = function (this: IntersectionObserver & { __perfCounted?: boolean }, target: Element) {
        if (!this.__perfCounted) {
            this.__perfCounted = true;
            observers++;
        }
        observeCalls++;
        return observe.call(this, target);
    };
    IO.prototype.disconnect = function (this: IntersectionObserver) {
        disconnectCalls++;
        return disconnect.call(this);
    };
}

window.addEventListener('error', (event) => {
    send('error', (event.message || 'unknown') + ' @ ' + (event.filename || '').split('/').pop() + ':' + event.lineno + ':' + event.colno);
});

let lastTick = now();
setInterval(() => {
    const tick = now();
    const gap = tick - lastTick - WATCHDOG_INTERVAL;
    if (gap > GAP_THRESHOLD) send('gap', gap + '@' + lastMark);
    lastTick = tick;
}, WATCHDOG_INTERVAL);

mark('boot', navigator.userAgent + ' ioPolyfill=' + Boolean(IO && 'THROTTLE_TIMEOUT' in IO.prototype));
