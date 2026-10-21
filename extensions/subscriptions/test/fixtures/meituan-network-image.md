# Meituan image network regression

Public URL supplied in the user's bug report:
https://p0.meituan.net/meituantechblog/f0ae68810ba98d662aa1d1d984b2a4e6144954.png

Captured on 2026-10-18 with a temporary isolated native WKWebView using a same-origin binary fetch. The response was HTTP 200, image/png, 141725 bytes. The fixture preserves the response bytes without Canvas conversion. Native direct reqwest failed with a connection reset on the same machine; the browser-backed route succeeded.

The offline cache regression replays the captured native response into the real extension image-cache pipeline and checks exact bytes, MIME, path, counts, and reader asset resolution. It does not exercise a real network request or native authorization; those checks are recorded separately in docs/native-image-acceptance.json.
