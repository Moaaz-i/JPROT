# Contributing to JPROT

Thanks for helping improve JPROT. Bug reports, documentation fixes, tests, and
small focused features are welcome.

## Development

JPROT supports Node.js 18 or newer and has no runtime dependencies.

```bash
git clone https://github.com/Moaaz-i/JPROT.git
cd JPROT
npm test
npm pack --dry-run
```

Keep changes focused, preserve the zero-dependency design, and add or update a
Node built-in test when behavior changes. Documentation changes should include
the relevant page or README update. Do not commit generated `dist/` or
`.cache/` files.

## Pull requests

Use a clear title and explain the user-facing behavior. Before opening a pull
request, run the test suite and packaging check above. Pull requests run the
test workflow; publishing is restricted to pushes to `main` after the workflow
confirms that the package version is new.

## Reporting issues

For bugs and feature requests, please use the
[GitHub issue tracker](https://github.com/Moaaz-i/JPROT/issues). For security
issues, follow [SECURITY.md](SECURITY.md) instead.
