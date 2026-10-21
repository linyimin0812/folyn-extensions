# WeChat article capture

Captured 2026-10-21 for the user-reported single-article failure
(https://mp.weixin.qq.com/s/ImCVcRPVYbA2RA3OcxXf1w). Public static response,
never executed as scripts; inline script bodies were emptied to keep the
fixture small — the parser strips scripts anyway. Test/development preview
only; excluded from extension dist and ZIP.

- wx-article.html — the article page. WeChat keeps the full text in
  `#js_content` with `visibility: hidden` until client JS runs, so static
  fetch + extraction works but Readability and generic selectors miss it.

Original content remains attributed to its author. The capture preserves the
response structure for deterministic parser regression.
