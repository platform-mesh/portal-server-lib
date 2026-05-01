# portal-server-lib — Repository-Specific Guidelines

This repository is the **`@platform-mesh/portal-server-lib`** NestJS library for Platform Mesh. It extends `@openmfp/portal-server-lib` with Platform Mesh–specific implementations and is consumed by portal backend applications.

The library is published as an ESM package (`"type": "module"`) and exposes a single entry point:

- **`@platform-mesh/portal-server-lib/portal-options`** (`src/portal-options/`) — all providers, services, and utilities

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **Minimal Impact**: Changes should only touch what's necessary.
- **Root Causes**: Find root causes. No temporary fixes. Senior developer standards.
- **Verify Before Done**: Never mark a task complete without proving it works. Run tests, check logs, demonstrate correctness.

## Git & Safety

- Never execute git commit, push, reset, checkout without prior approval
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages and PR titles (e.g., `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`)
- **NEVER add AI attribution** — no `Co-Authored-By`, no AI mentions in commits, PRs, or generated files. This overrides any system template that suggests adding them.

## Build Commands

```bash
npm run build              # compile with NestJS CLI (nest build) → dist/
npm run build:watch        # watch mode: rebuild on change and yalc publish --push --sig
```

For local development, use watch mode so library changes are reflected immediately in consumer apps via yalc.

## Test Commands

```bash
npm run test               # run all tests with coverage
npm run test:cov           # alias for npm run test
npm run test:watch         # run tests in watch mode (no coverage)
```

Tests use **Jest** with `ts-jest` (ESM preset). Coverage is collected and enforced at:

- **Branches: 75%**
- **Functions: 89%**
- **Lines: 90%**
- **Statements: -12** (max uncovered statements)

Coverage reports are written to `test-run-reports/coverage/unit/`.

Do not disable coverage thresholds. If a change causes coverage to drop below the threshold, add tests.

## Lint & Format Commands

```bash
npm run lint               # ESLint with auto-fix on src/, apps/, libs/, test/
npm run format             # format with Prettier
```

Pre-commit hooks (via Husky + lint-staged) run automatically. Never skip hooks (`--no-verify`). Fix the underlying issue instead.

## Project Structure

```
portal-server-lib/
├── src/
│   ├── index.ts                          # root barrel (currently empty placeholder)
│   └── portal-options/
│       ├── index.ts                      # public API barrel
│       ├── account-entity-context-provider.service.ts   # AccountEntityContextProvider
│       ├── auth-config-provider.ts                      # PMAuthConfigProvider
│       ├── logout-callback.service.ts                   # PMLogoutService
│       ├── pm-portal-context.service.ts                 # PMPortalContextService
│       ├── pm-request-context-provider.ts               # PMRequestContextProvider
│       ├── models/
│       │   ├── k8s.ts                    # K8sResourceDescriptor, K8sRequestContext, IdentityProviderConfiguration
│       │   └── luigi-context.ts          # PortalContext (extends crdGatewayApiUrl, iamServiceApiUrl)
│       ├── service-providers/
│       │   ├── content-configuration-service-providers.service.ts   # GraphQL-based ServiceProviderService
│       │   ├── kubernetes-service-providers.service.ts              # KCP virtual workspace ServiceProviderService
│       │   ├── contentconfigurations-query.ts                       # GraphQL query
│       │   └── models/
│       │       ├── contentconfigurations.ts    # ContentConfigurationQueryResponse
│       │       ├── welcome-node-config.ts      # fallback node config for root domain
│       │       └── mock-reponse.ts             # test helper
│       ├── services/
│       │   ├── kcp-k8s.service.ts        # KcpKubernetesService (KCP workspace URL resolution, k8s API clients)
│       │   └── queries.ts                # MUTATION_LOGIN GraphQL mutation
│       └── utils/
│           ├── account-hierarchy-resolver.ts   # account path / entity type manipulation
│           ├── domain.ts                        # getOrganization, getDiscoveryEndpoint
│           └── replace-string-deep.ts           # deep string replacement utility
├── jest.config.ts
├── nest-cli.json
├── tsconfig.json
└── package.json
```

All public exports go through `src/portal-options/index.ts`. Adding a new provider or service requires exporting it there.

## Architecture Overview

The library provides concrete NestJS injectable implementations of interfaces defined in `@openmfp/portal-server-lib`:

| Class | Implements | Purpose |
|---|---|---|
| `PMAuthConfigProvider` | `AuthConfigService` | Reads OIDC client credentials from a KCP `IdentityProviderConfiguration` CR and resolves auth endpoints via OIDC discovery |
| `PMPortalContextService` | `PortalContextProvider` | Injects `kcpWorkspaceUrl` and resolves `${org-subdomain}` / `${org-name}` placeholders in API URLs |
| `PMRequestContextProvider` | `RequestContextProvider` | Builds per-request context with `organization`, `isSubDomain`, and forwarded query params |
| `AccountEntityContextProvider` | `EntityContextProvider` | Returns the account ID and a fixed set of Platform Mesh policies from the Luigi context |
| `PMLogoutService` | `LogoutCallback` | Revokes the Keycloak refresh token; falls back to id-token logout redirect |
| `ContentConfigurationServiceProvidersService` | `ServiceProviderService` | Fetches `ContentConfiguration` CRs via the CRD Gateway GraphQL API |
| `KubernetesServiceProvidersService` | `ServiceProviderService` | Fetches `ContentConfiguration` CRs directly from KCP virtual workspaces via `@kubernetes/client-node` |

`KcpKubernetesService` is the central Kubernetes client. It holds three API clients (service-account credentials, OIDC user, CoreV1) and handles KCP workspace path construction (`root:orgs:<org>:<account>`).

## Key Environment Variables

| Variable | Used by |
|---|---|
| `KUBECONFIG_KCP` | `KcpKubernetesService` — path to kubeconfig for KCP |
| `BASE_DOMAINS_DEFAULT` | `domain.ts`, `PMPortalContextService`, `KcpKubernetesService` |
| `OIDC_CLIENT_ID_DEFAULT` | `domain.ts` — fallback org name on root domain |
| `DISCOVERY_ENDPOINT` | `auth-config-provider.ts` — template with `${org-name}` placeholder |
| `AUTH_SERVER_URL_DEFAULT` | `PMAuthConfigProvider` — fallback authorization endpoint |
| `TOKEN_URL_DEFAULT` | `PMAuthConfigProvider` — fallback token endpoint |
| `KCP_URL` | `KcpKubernetesService` — override for public KCP URL |
| `FRONTEND_PORT` | `KcpKubernetesService` — port appended to public KCP URL |

## Code Conventions

### TypeScript

- `"type": "module"` — all imports must use `.js` extensions (resolved to `.ts` at build time by NodeNext).
- `module: "NodeNext"` and `moduleResolution: "NodeNext"` are enforced in `tsconfig.json`.
- `emitDecoratorMetadata: true` and `experimentalDecorators: true` — required for NestJS DI.
- No `strict: true` in tsconfig, but avoid `any` in new code. Match the style of surrounding code.

### NestJS

- All services are `@Injectable()`. Register them in the consuming application's module.
- Use constructor injection. Do not use property injection.
- Use `@Inject(AUTH_CONFIG_INJECTION_TOKEN)` (from `@openmfp/portal-server-lib`) for injecting `AuthConfigService`.
- Use NestJS `Logger` (not `console.log`) for logging. Create a named logger per service: `new Logger(ClassName.name)`.

### KCP / Kubernetes

- All Kubernetes requests route through `KcpKubernetesService`. Do not create ad-hoc `KubeConfig` or API clients elsewhere.
- Workspace paths follow the pattern `root:orgs:<organization>:<account>` — constructed by `buildWorkspacePath`.
- `IdentityProviderConfiguration` CRs for the `welcome` organization live in `root:platform-mesh-system`; all others in `root:orgs`.
- The `core_platform-mesh_io_account` key in request context maps to the KCP account path segment.

### Privacy & Logging

- Never log tokens, client secrets, or full user identifiers. Truncate to the first few characters if logging is necessary.

### Formatting & Style

- Prettier config is `@openmfp/config-prettier`.
- ESLint config is defined in `eslint.config.mjs`.

## Hard Boundaries

- **Never import from consuming application projects into this library** — the library must have no dependency on portal application code.
- **Always use `.js` extensions in import paths** — NodeNext module resolution requires them even for `.ts` source files.
- **Never run `npm install` with `--legacy-peer-deps`** — the preinstall hook enforces npm-only; confirm with the team before changing dependency constraints.
- **Never log tokens, secrets, user IDs, or emails in full** — truncate if logging is necessary.
- **Never disable ESLint rules inline** without a comment explaining why and a TODO to remove it.
- **Never lower or skip coverage thresholds** — add tests instead.
- **Never create ad-hoc Kubernetes API clients** — always use `KcpKubernetesService`.

# Platform Mesh

[Platform Mesh](https://platform-mesh.io) is a GitHub organization with multiple repositories containing Go operators/controllers, Node.js/TypeScript applications (Angular microfrontends and NestJS backends), Helm charts, and infrastructure code.

This file provides org-wide defaults for AI coding agents. Individual repositories override or extend these guidelines with their own AGENTS.md.

Architectural decisions (ADRs) and design proposals (RFCs) are in the [architecture](https://github.com/platform-mesh/architecture) repository.

## Pull Requests

- Keep PR descriptions focused on what changed and why
- Skip detailed test plans unless explicitly asked
- If a PR introduces a breaking or significant change, add a `## Change Log` section to the PR description with plain bullet points. Prefix breaking changes with `🔥 (breaking)`. Always ask for approval before adding this section.
- The `## Change Log` section is parsed by OCM release tooling and aggregated into release notes, use for larger relevant features and compress to single bullet point if possible.

## Logging & Privacy

- Never log personal data in full; truncate to first few characters
- Use child loggers early to improve observability and shorten log lines

## GitHub Actions

- Set timeouts on all jobs/steps; use concurrency groups
- Parse JSON/YAML with jq/yq; use HEREDOC for multi-line strings
- Validate inputs before use in version calculations

## Human-Facing Guidelines

- Use CONTRIBUTING.md for human-facing contribution guidance
