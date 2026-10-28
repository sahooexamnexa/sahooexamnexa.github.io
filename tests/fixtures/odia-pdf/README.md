# Synthetic embedded-font PDF fixtures

These files contain only controlled synthetic questions, not a real question bank.
`valid.pdf` has three questions on three pages; `wrapped.pdf` has two questions on
two pages. Their Arial and Nirmala UI subsets and Unicode maps are embedded. Local
Chromium printing created the files; tests require neither installed fonts nor a
browser. `expected.json` retains the original controlled strings and answer labels.

The four adversarial files derive from `valid.pdf` by changing only the Odia font's
ToUnicode data: U+0000, private-use U+E001, visual-order vowel-before-base, or a
missing map. They must remain blocked. They are not examples of supported fonts.
`sha256.json` pins the original fixture bytes. No production records or standalone
font files are included, and the public artifact allowlist excludes this directory.

Field comparisons allow Unicode NFC equivalence and ordinary line-wrap whitespace
only. They never delete Odia marks, repair a mapping, or remove spaces inside words.
Passing these examples does not certify arbitrary font maps, factual answers, PYP
provenance, OCR, or hosted Edge resource limits.
