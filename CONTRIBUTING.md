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

## npm publishing

Publishing uses the repository secret `NPM_TOKEN` and an explicit non-interactive
registry configuration. A normal npm token does **not** bypass account 2FA:
create an npm **automation token** (the “bypass 2FA” publish token), or use a
granular token configured for publishing with the required 2FA policy. Do not
use or commit a personal password/token.

As an alternative, configure npm **Trusted Publishing** for this repository and
workflow using GitHub Actions OIDC; in that setup the token-based requirement
must be removed in favor of npm's trusted-publisher configuration. The workflow
uses npm provenance and only publishes when `package.json` changed and that
exact version is not already on the registry.

## Reporting issues

For bugs and feature requests, please use the
[GitHub issue tracker](https://github.com/Moaaz-i/JPROT/issues). For security
issues, follow [SECURITY.md](SECURITY.md) instead.
