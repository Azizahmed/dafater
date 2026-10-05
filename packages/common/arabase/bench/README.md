# arabase benchmarks

Measure the boot sequence (language/direction per painted frame) and editor
latency of a production web build. Used to compare a build before and after
arabase changes.

```sh
# 1. Build the web app with local assets and serve it (SPA fallback + gzip)
PUBLIC_PATH=/ yarn affine build -p @affine/web
cp -r packages/frontend/apps/web/dist /tmp/web-dist
node packages/common/arabase/bench/serve.mjs /tmp/web-dist 8090

# 2. Boot: every distinct `dir|lang|sidebar|ui-language` state per frame,
#    FCP, time to app sidebar, layout shift. THROTTLE=1 → 20 Mbps, 2× CPU.
node packages/common/arabase/bench/boot-bench.mjs http://localhost:8090 after 5
THROTTLE=1 node packages/common/arabase/bench/boot-bench.mjs http://localhost:8090 after-throttled 3

# 3. Long document (2000 mixed Arabic/English paragraphs): paste, reopen and
#    keystroke → next-frame latency while typing Arabic and English.
node packages/common/arabase/bench/typing-bench.mjs http://localhost:8090 after 2000
```

Results are written as JSON next to the current working directory. Run the
before/after builds alternately: timings vary ±10 % between runs.
