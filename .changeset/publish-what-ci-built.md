---
'@_linked/translation': patch
---

Publishing no longer rebuilds the package. `prepublishOnly` ran `linked build` again with the CLI pinned in the lockfile (1.11.1), replacing the output the release workflow had just built and checked; that older CLI is also why the tarball carried a stray `lib/cjs/data/translation.json`. It now only runs the subpath check against the `lib/` it is about to publish.
