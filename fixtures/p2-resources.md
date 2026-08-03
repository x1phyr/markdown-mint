---
title: Resource pipeline security fixture
language: en
---

# Resource pipeline

The compiler must keep failures visible and bounded.

![Local asset](./asset.png "A deterministic local asset")

![Private URL](http://127.0.0.1:4310/secret.png)

```mermaid
graph TD
  A[Untrusted source] --> B[Sanitized SVG]
```

```math
\sum_{i=1}^{n} i = \frac{n(n+1)}{2}
```
