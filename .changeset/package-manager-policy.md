---
'@_linked/translation': patch
---

Adopt the shared release pipeline: declare npm as the package manager, point `repository.url` at the `linked-fw` org, mark `package-lock.json` as a generated file, and add the `@testing-library/dom` devDependency the test suite needs on a peer-less install.
