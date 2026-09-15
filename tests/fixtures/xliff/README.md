# XLIFF fixture provenance

All fixture text in this directory is synthetic and contains no customer,
production, or private data.

- `memoq-inline-1.2.xlf` is a minimal interoperability fixture modeled on the
  XLIFF 1.2 inline-code structure emitted by memoQ: paired `bpt`/`ept` codes
  and standalone `ph` codes with stable IDs.
- `trados-inline-1.2.xlf` is a minimal interoperability fixture modeled on the
  XLIFF 1.2 inline-code structure commonly exchanged with Trados: `g` groups
  and standalone `x` codes with stable IDs.
- `foreign-2.0.xlf` is specification-focused XLIFF 2.0 without any Create Now
  extension metadata.
- `xxe-1.2.xlf` is a security fixture. Its external entity URL is deliberately
  non-routable and must never be resolved because the adapter rejects DTDs
  before parsing.

The vendor-style files reproduce structural conventions only; they are not
vendor-owned sample content and make no claim of byte-for-byte identity with
every version or configuration of those CAT tools.
