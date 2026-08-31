import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import {
  AuthorizationRequest,
  SubjectAccessReview,
} from '../models/permissions.model.js';
import { AuthzWebhookService } from './authz-webhook.service.js';

// Build a valid JWT token with the given payload
function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString(
    'base64url',
  );
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

const WEBHOOK_URL = 'https://authz.example.com';
// The service posts to `${webhookUrl}/batch-authz`.
const BATCH_URL = `${WEBHOOK_URL}/batch-authz`;

// The posted body is the SubjectAccessReview[] array itself.
function postedItems(post: jest.Mock): SubjectAccessReview[] {
  return post.mock.calls[0][1] as SubjectAccessReview[];
}

// Helper that allows every submitted verb.
function allowAll() {
  return (_url: string, items: SubjectAccessReview[]) =>
    of({
      data: items.map((item) => ({ id: item.metadata.name, allowed: true })),
    });
}

function makeBaseAuthzRequest(
  overrides: Partial<AuthorizationRequest> = {},
): AuthorizationRequest {
  return {
    token: makeJwt({ email: 'user@example.com' }),
    organization: 'my-org',
    accountPath: 'sub-path',
    checks: [
      {
        resource: 'Accounts',
        group: 'core.example.com',
        actions: ['get', 'list'],
      },
    ],
    ...overrides,
  };
}

function makeInstanceRequest(
  overrides: Partial<AuthorizationRequest> = {},
): AuthorizationRequest {
  return {
    token: makeJwt({ email: 'user@example.com' }),
    organization: 'my-org',
    accountPath: 'sub-path',
    checks: [
      {
        resource: 'HttpBins',
        group: 'example.com',
        namespace: 'default',
        name: 'my-bin',
        actions: ['get', 'delete'],
      },
    ],
    ...overrides,
  };
}

describe('AuthzWebhookService', () => {
  let service: AuthzWebhookService;
  let httpService: { post: jest.Mock };
  const OLD_ENV = process.env;

  beforeEach(async () => {
    process.env = { ...OLD_ENV };
    process.env['OPENMFP_PORTAL_CONTEXT_AUTHZ_WEBHOOK_URL'] = WEBHOOK_URL;

    httpService = { post: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthzWebhookService,
        { provide: HttpService, useValue: httpService },
      ],
    }).compile();

    service = module.get(AuthzWebhookService);
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Constructor / env-var handling
  // ──────────────────────────────────────────────────────────────────────────
  describe('when OPENMFP_PORTAL_CONTEXT_AUTHZ_WEBHOOK_URL is not set', () => {
    beforeEach(async () => {
      delete process.env['OPENMFP_PORTAL_CONTEXT_AUTHZ_WEBHOOK_URL'];

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthzWebhookService,
          { provide: HttpService, useValue: httpService },
        ],
      }).compile();

      service = module.get(AuthzWebhookService);
    });

    it('checkActionsForResource returns undefined without calling http', async () => {
      const result = await service.checkActionsForResource(
        makeBaseAuthzRequest(),
      );
      expect(result).toBeUndefined();
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('checkActionsForInstance returns undefined without calling http', async () => {
      const result = await service.checkActionsForInstance(
        makeInstanceRequest(),
      );
      expect(result).toBeUndefined();
      expect(httpService.post).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // checkActionsForResource — Tier 1
  // ──────────────────────────────────────────────────────────────────────────
  describe('checkActionsForResource', () => {
    it('returns undefined when checks array is empty', async () => {
      const result = await service.checkActionsForResource(
        makeBaseAuthzRequest({ checks: [] }),
      );
      expect(result).toBeUndefined();
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('builds one SubjectAccessReview per {resource, verb} pair', async () => {
      httpService.post.mockReturnValue(of({ data: [] }));

      await service.checkActionsForResource(makeBaseAuthzRequest());

      // 1 resource * 2 actions = 2 items
      expect(postedItems(httpService.post)).toHaveLength(2);
    });

    it('posts the SubjectAccessReview array to the /batch-authz endpoint', async () => {
      httpService.post.mockReturnValue(of({ data: [] }));

      await service.checkActionsForResource(makeBaseAuthzRequest());

      expect(httpService.post.mock.calls[0][0]).toBe(BATCH_URL);
      const items = postedItems(httpService.post);
      expect(items[0].kind).toBe('SubjectAccessReview');
      expect(items[0].apiVersion).toBe('authorization.k8s.io/v1');
    });

    it('maps allowed:true results to Permission[] and excludes denied verbs', async () => {
      httpService.post.mockImplementation((_url, items: SubjectAccessReview[]) =>
        of({
          data: [
            { id: items[0].metadata.name, allowed: true },
            { id: items[1].metadata.name, allowed: false },
          ],
        }),
      );

      const result = await service.checkActionsForResource(
        makeBaseAuthzRequest(),
      );
      // only 'get' (item 0) is allowed; 'list' (item 1) is denied
      expect(result).toEqual([{ resource: 'Accounts', actions: ['get'] }]);
    });

    it('returns empty array when all verbs are denied', async () => {
      httpService.post.mockImplementation((_url, items: SubjectAccessReview[]) =>
        of({
          data: items.map((item) => ({
            id: item.metadata.name,
            allowed: false,
          })),
        }),
      );

      const result = await service.checkActionsForResource(
        makeBaseAuthzRequest(),
      );
      expect(result).toEqual([]);
    });

    it('returns undefined on HTTP error (fail-open)', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('network error')),
      );

      const result = await service.checkActionsForResource(
        makeBaseAuthzRequest(),
      );
      expect(result).toBeUndefined();
    });

    it('treats a non-array response body as no results (empty array)', async () => {
      httpService.post.mockReturnValue(of({ data: undefined }));

      const result = await service.checkActionsForResource(
        makeBaseAuthzRequest(),
      );
      expect(result).toEqual([]);
    });

    it('joins organization and accountPath into the cluster-path extra when non-empty', async () => {
      httpService.post.mockReturnValue(of({ data: [] }));

      await service.checkActionsForResource(
        makeBaseAuthzRequest({ organization: 'org', accountPath: 'acc1:acc2' }),
      );

      const items = postedItems(httpService.post);
      expect(
        items[0].spec.extra['authorization.kubernetes.io/cluster-path'],
      ).toEqual(['root:orgs:org:acc1:acc2']);
    });

    it('uses organization only for cluster-path when accountPath is empty', async () => {
      httpService.post.mockReturnValue(of({ data: [] }));

      await service.checkActionsForResource(
        makeBaseAuthzRequest({ organization: 'my-org', accountPath: '' }),
      );

      const items = postedItems(httpService.post);
      expect(
        items[0].spec.extra['authorization.kubernetes.io/cluster-path'],
      ).toEqual(['root:orgs:my-org']);
    });

    it('extracts email from JWT token for the user field', async () => {
      httpService.post.mockReturnValue(of({ data: [] }));
      const token = makeJwt({ email: 'alice@example.com' });

      await service.checkActionsForResource(makeBaseAuthzRequest({ token }));

      expect(postedItems(httpService.post)[0].spec.user).toBe(
        'alice@example.com',
      );
    });

    it('uses empty string for user when JWT has no email', async () => {
      httpService.post.mockReturnValue(of({ data: [] }));
      const token = makeJwt({ sub: 'some-user-id' });

      await service.checkActionsForResource(makeBaseAuthzRequest({ token }));

      expect(postedItems(httpService.post)[0].spec.user).toBe('');
    });

    it('uses empty string for user when token is malformed', async () => {
      httpService.post.mockReturnValue(of({ data: [] }));

      await service.checkActionsForResource(
        makeBaseAuthzRequest({ token: 'not-a-jwt' }),
      );

      expect(postedItems(httpService.post)[0].spec.user).toBe('');
    });

    it('omits namespace and name from resourceAttributes (Tier 1 is cluster-scoped)', async () => {
      httpService.post.mockReturnValue(of({ data: [] }));

      await service.checkActionsForResource(makeBaseAuthzRequest());

      const attrs = postedItems(httpService.post)[0].spec.resourceAttributes;
      expect(attrs.namespace).toBeUndefined();
      expect(attrs.name).toBeUndefined();
    });

    it('lowercases the resource name in resourceAttributes', async () => {
      httpService.post.mockReturnValue(of({ data: [] }));

      await service.checkActionsForResource(
        makeBaseAuthzRequest({
          checks: [{ resource: 'FooItems', group: '', actions: ['get'] }],
        }),
      );

      expect(
        postedItems(httpService.post)[0].spec.resourceAttributes.resource,
      ).toBe('fooitems');
    });

    it('merges permissions for multiple checks across resources', async () => {
      httpService.post.mockImplementation(allowAll());

      const result = await service.checkActionsForResource(
        makeBaseAuthzRequest({
          checks: [
            { resource: 'A', group: '', actions: ['get'] },
            { resource: 'B', group: '', actions: ['list'] },
          ],
        }),
      );

      expect(result).toHaveLength(2);
      const resources = result!.map((p) => p.resource);
      expect(resources).toContain('A');
      expect(resources).toContain('B');
    });

    it('ignores result ids with no matching correlation entry', async () => {
      httpService.post.mockReturnValue(
        of({ data: [{ id: 'unknown-id', allowed: true }] }),
      );

      const result = await service.checkActionsForResource(
        makeBaseAuthzRequest(),
      );
      expect(result).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // checkActionsForInstance — Tier 2
  // ──────────────────────────────────────────────────────────────────────────
  describe('checkActionsForInstance', () => {
    it('returns undefined when actions array is empty (no items built)', async () => {
      const result = await service.checkActionsForInstance(
        makeInstanceRequest({
          checks: [
            {
              resource: 'HttpBins',
              group: 'example.com',
              namespace: 'default',
              name: 'my-bin',
              actions: [],
            },
          ],
        }),
      );

      expect(result).toBeUndefined();
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('sends one SubjectAccessReview per action verb', async () => {
      httpService.post.mockReturnValue(of({ data: [] }));

      await service.checkActionsForInstance(makeInstanceRequest());

      // 2 actions = 2 items
      expect(postedItems(httpService.post)).toHaveLength(2);
    });

    it('includes name and namespace in resourceAttributes', async () => {
      httpService.post.mockReturnValue(of({ data: [] }));

      await service.checkActionsForInstance(makeInstanceRequest());

      const attrs = postedItems(httpService.post)[0].spec.resourceAttributes;
      expect(attrs.name).toBe('my-bin');
      expect(attrs.namespace).toBe('default');
    });

    it('omits name from resourceAttributes when not provided', async () => {
      httpService.post.mockReturnValue(of({ data: [] }));

      await service.checkActionsForInstance(
        makeInstanceRequest({
          checks: [
            {
              resource: 'HttpBins',
              group: 'example.com',
              namespace: 'default',
              actions: ['get'],
            },
          ],
        }),
      );

      expect(
        postedItems(httpService.post)[0].spec.resourceAttributes.name,
      ).toBeUndefined();
    });

    it('returns allowed verbs as Permission[]', async () => {
      httpService.post.mockImplementation((_url, items: SubjectAccessReview[]) =>
        of({
          data: [
            { id: items[0].metadata.name, allowed: true },
            { id: items[1].metadata.name, allowed: false },
          ],
        }),
      );

      const result = await service.checkActionsForInstance(
        makeInstanceRequest(),
      );

      expect(result).toEqual([
        {
          resource: 'HttpBins',
          namespace: 'default',
          name: 'my-bin',
          actions: ['get'],
        },
      ]);
    });

    it('returns empty array when all verbs are denied (not undefined)', async () => {
      httpService.post.mockImplementation((_url, items: SubjectAccessReview[]) =>
        of({
          data: items.map((item) => ({
            id: item.metadata.name,
            allowed: false,
          })),
        }),
      );

      const result = await service.checkActionsForInstance(
        makeInstanceRequest(),
      );
      // items were sent but all denied — empty array, NOT undefined
      expect(result).toEqual([]);
    });

    it('returns undefined on HTTP error (fail-open)', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('webhook down')),
      );

      const result = await service.checkActionsForInstance(
        makeInstanceRequest(),
      );
      expect(result).toBeUndefined();
    });

    it('groups verbs by resource|namespace|name key in Permission[]', async () => {
      httpService.post.mockImplementation(allowAll());

      const result = await service.checkActionsForInstance(
        makeInstanceRequest({
          checks: [
            {
              resource: 'MyResources',
              group: 'example.com',
              namespace: 'my-ns',
              name: 'my-name',
              actions: ['get', 'delete'],
            },
          ],
        }),
      );

      expect(result).toHaveLength(1);
      expect(result![0].resource).toBe('MyResources');
      expect(result![0].namespace).toBe('my-ns');
      expect(result![0].name).toBe('my-name');
      expect(result![0].actions).toContain('get');
      expect(result![0].actions).toContain('delete');
    });

    it('omits namespace from the grouped permission when the instance is cluster-scoped', async () => {
      httpService.post.mockImplementation(allowAll());

      const result = await service.checkActionsForInstance(
        makeInstanceRequest({
          checks: [
            {
              resource: 'Clusters',
              group: 'example.com',
              name: 'cluster-1',
              actions: ['get'],
            },
          ],
        }),
      );

      expect(result).toHaveLength(1);
      expect(result![0].namespace).toBeUndefined();
      expect(result![0].name).toBe('cluster-1');
    });

    it('ignores result ids with no matching correlation entry', async () => {
      httpService.post.mockReturnValue(
        of({ data: [{ id: 'unknown-id', allowed: true }] }),
      );

      const result = await service.checkActionsForInstance(
        makeInstanceRequest(),
      );
      expect(result).toEqual([]);
    });
  });
});
