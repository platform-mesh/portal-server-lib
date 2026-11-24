## Overview

# Contributing to platform-mesh

We want to make contributing to this project as easy and transparent as possible.

## Our development process

We use GitHub to track issues and feature requests, as well as accept pull requests.

## Pull requests

You are welcome to contribute with your pull requests. These steps explain the contribution process:

1. Fork the repository and create your branch from `main`.
1. [Add tests](#testing) for your code.
1. If you've changed APIs, update the documentation.
1. Make sure the tests pass. Our GitHub actions pipeline is running the unit and e2e tests for your PR and will indicate any issues.
1. Sign the Developer Certificate of Origin (DCO).
1. Give the pull request a [Conventional Commits](https://www.conventionalcommits.org/) title, for example `feat: add a content configuration provider` or `fix: keep the session after token refresh`. The title becomes the squash commit message and the entry in the release notes.

### Building

Run `npm build` to build the project.
The build artifacts will be stored in the `dist/` directory.

## Testing

> **NOTE:** You should always add tests, if you are adding code to our repository.

Run `npm test` to execute the unit tests via [Vitest](https://vitest.dev/) in the root directory of the repository.

## Releasing

Merging to `main` does not publish anything. A release takes two steps.

First, set the release version in `package.json` in a pull request and merge it:

```sh
npm version 1.2.0 --no-git-tag-version
```

The release fails when the version in these files differs from the tag, so a checkout of a release tag always shows the published version. A release candidate needs its own version too, for example `1.2.0-rc.1`.

Then create the version tag. To create the tag from GitHub, open **Actions → release → Run workflow**, select the branch and enter the version, for example `1.2.0` or `1.2.0-rc.1`. The workflow checks the version, tags the latest commit of the branch and starts the release for the tag.

You can also push the tag yourself:

```sh
git switch main
git pull
git tag v1.2.0
git push origin v1.2.0
```

- Use `vX.Y.Z` for a release and `vX.Y.Z-rc.N` for a release candidate.
- Tag a commit on `main`, or on a maintenance branch `release/X.Y` for patch releases of an older version. A maintenance branch only accepts `X.Y.*` versions of its own line.
- The version must be higher than the last release on the same branch.

The release workflow publishes `@platform-mesh/portal-server-lib` to npm and creates a GitHub release with notes generated from the commit titles:

| Tag | Branch | npm dist-tag | GitHub release |
|---|---|---|---|
| `vX.Y.Z` | `main` | `latest` | latest |
| `vX.Y.Z-rc.N` | `main` | `next` | pre-release |
| `vX.Y.Z` | `release/X.Y` | `release-X.Y` | release |
| `vX.Y.Z-rc.N` | `release/X.Y` | `release-X.Y-next` | pre-release |

## Issues

We use GitHub issues to track bugs. Please ensure your description is
clear and includes sufficient instructions to reproduce the issue.

## License

By contributing to platform-mesh, you agree that your contributions will be licensed
under its [Apache-2.0 license](LICENSES).
