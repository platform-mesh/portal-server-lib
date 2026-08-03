import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { AuthzWebhookService } from './authz-webhook.service.js';
import { AuthorizationRequest } from './models/permissions.model.js';

// Build a valid JWT token with the given payload
function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}

const WEBHOOK_URL = 'https://authz.example.com';

function makeBaseAuthzRequest(overrides: Partial<AuthorizationRequest> = {}): AuthorizationRequest {
  return {
    token: makeJwt({ email: 'user@example.com' }),
    organization: 'my-org',
    accountPath: 'sub-path',
    checks: [
      {
        resource: 'Account',
        apiGroup: 'core.example.com',
        entityCollection: 'Accounts',
        version: 'v1',
        actions: ['get', 'list'],
      },
    ],
    ...overrides,
  };
}

function makeInstanceRequest(overrides: Partial<AuthorizationRequest> = {}): AuthorizationRequest {
  return {
    token: makeJwt({ email: 'user@example.com' }),
    organization: 'my-org',
    accountPath: 'sub-path',
    checks: [
      {
        resource: 'HttpBin',
        apiGroup: 'example.com',
        entityCollection: 'httpbins',
        version: 'v1',
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
    // Save env and set webhook URL for all tests
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
    // Restore env after each test
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
      const result = await service.checkActionsForResource(makeBaseAuthzRequest());
      expect(result).toBeUndefined();
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('checkActionsForInstance returns undefined without calling http', async () => {
      const result = await service.checkActionsForInstance(makeInstanceRequest());
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

    it('builds one batch item per {resource, verb} pair', async () => {
      httpService.post.mockReturnValue(
        of({ data: { results: [] } }),
      );

      await service.checkActionsForResource(makeBaseAuthzRequest());

      const body = httpService.post.mock.calls[0][1];
      // 1 resource * 2 actions = 2 items
      expect(body.items).toHaveLength(2);
    });

    it('sends to /batch-authz endpoint', async () => {
      httpService.post.mockReturnValue(of({ data: { results: [] } }));

      await service.checkActionsForResource(makeBaseAuthzRequest());

      expect(httpService.post.mock.calls[0][0]).toBe(`${WEBHOOK_URL}/batch-authz`);
    });

    it('attaches httpsAgent with rejectUnauthorized:false for https URLs', async () => {
      httpService.post.mockReturnValue(of({ data: { results: [] } }));

      await service.checkActionsForResource(makeBaseAuthzRequest());

      const config = httpService.post.mock.calls[0][2];
      expect(config.httpsAgent).toBeDefined();
      expect(config.httpsAgent.options?.rejectUnauthorized).toBe(false);
    });

    it('does NOT attach httpsAgent for http URLs', async () => {
      delete process.env['OPENMFP_PORTAL_CONTEXT_AUTHZ_WEBHOOK_URL'];
      process.env['OPENMFP_PORTAL_CONTEXT_AUTHZ_WEBHOOK_URL'] = 'http://authz.example.com';

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AuthzWebhookService,
          { provide: HttpService, useValue: httpService },
        ],
      }).compile();
      const httpSvc = module.get(AuthzWebhookService);

      httpService.post.mockReturnValue(of({ data: { results: [] } }));
      await httpSvc.checkActionsForResource(makeBaseAuthzRequest());

      const config = httpService.post.mock.calls[0][2];
      expect(config.httpsAgent).toBeUndefined();
    });

    it('maps allowed:true results to Permission[]', async () => {
      httpService.post.mockImplementation((_url, body) => {
        const [item0, item1] = body.items;
        return of({
          data: {
            results: [
              { id: item0.id, allowed: true },
              { id: item1.id, allowed: false },
            ],
          },
        });
      });

      const result = await service.checkActionsForResource(makeBaseAuthzRequest());
      // only 'get' (item0) is allowed; 'list' (item1) is denied
      expect(result).toHaveLength(1);
      expect(result![0]).toEqual({
        resource: 'Account',
        actions: ['get'],
      });
    });

    it('excludes denied (allowed:false) results', async () => {
      httpService.post.mockImplementation((_url, body) => {
        return of({
          data: {
            results: body.items.map((item: any) => ({
              id: item.id,
              allowed: false,
            })),
          },
        });
      });

      const result = await service.checkActionsForResource(makeBaseAuthzRequest());
      expect(result).toEqual([]);
    });

    it('returns undefined on HTTP error (fail-open)', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('network error')),
      );

      const result = await service.checkActionsForResource(makeBaseAuthzRequest());
      expect(result).toBeUndefined();
    });

    it('joins organization and accountPath for clusterPath when non-empty', async () => {
      httpService.post.mockReturnValue(of({ data: { results: [] } }));

      await service.checkActionsForResource(
        makeBaseAuthzRequest({ organization: 'org', accountPath: 'acc1:acc2' }),
      );

      const body = httpService.post.mock.calls[0][1];
      expect(body.items[0].clusterPath).toBe('root:orgs:org:acc1:acc2');
    });

    it('uses organization for clusterPath when accountPath is empty', async () => {
      httpService.post.mockReturnValue(of({ data: { results: [] } }));

      await service.checkActionsForResource(
        makeBaseAuthzRequest({ organization: 'my-org', accountPath: '' }),
      );

      const body = httpService.post.mock.calls[0][1];
      expect(body.items[0].clusterPath).toBe('root:orgs:my-org');
    });

    it('extracts email from JWT token for user field', async () => {
      httpService.post.mockReturnValue(of({ data: { results: [] } }));
      const token = makeJwt({ email: 'alice@example.com' });

      await service.checkActionsForResource(makeBaseAuthzRequest({ token }));

      const body = httpService.post.mock.calls[0][1];
      expect(body.items[0].user).toBe('alice@example.com');
    });

    it('uses empty string for user when JWT has no email', async () => {
      httpService.post.mockReturnValue(of({ data: { results: [] } }));
      const token = makeJwt({ sub: 'some-user-id' });

      await service.checkActionsForResource(makeBaseAuthzRequest({ token }));

      const body = httpService.post.mock.calls[0][1];
      expect(body.items[0].user).toBe('');
    });

    it('uses empty string for user when token is malformed', async () => {
      httpService.post.mockReturnValue(of({ data: { results: [] } }));

      await service.checkActionsForResource(
        makeBaseAuthzRequest({ token: 'not-a-jwt' }),
      );

      const body = httpService.post.mock.calls[0][1];
      expect(body.items[0].user).toBe('');
    });

    it('uses empty string for user when token is empty string', async () => {
      httpService.post.mockReturnValue(of({ data: { results: [] } }));

      await service.checkActionsForResource(makeBaseAuthzRequest({ token: '' }));

      const body = httpService.post.mock.calls[0][1];
      expect(body.items[0].user).toBe('');
    });

    it('omits namespace and name from resourceAttributes even when provided (Tier 1 is cluster-scoped)', async () => {
      httpService.post.mockReturnValue(of({ data: { results: [] } }));

      await service.checkActionsForResource(
        makeBaseAuthzRequest({
          checks: [
            {
              resource: 'Pod',
              apiGroup: 'v1',
              entityCollection: 'pods',
              version: 'v1',
              namespace: 'kube-system',
              name: 'my-pod',
              actions: ['get'],
            },
          ],
        }),
      );

      const body = httpService.post.mock.calls[0][1];
      expect(body.items[0].resourceAttributes.namespace).toBeUndefined();
      expect(body.items[0].resourceAttributes.name).toBeUndefined();
    });

    it('omits namespace from resourceAttributes when not provided', async () => {
      httpService.post.mockReturnValue(of({ data: { results: [] } }));

      await service.checkActionsForResource(makeBaseAuthzRequest());

      const body = httpService.post.mock.calls[0][1];
      expect(body.items[0].resourceAttributes.namespace).toBeUndefined();
    });

    it('lowercases entityCollection in resourceAttributes', async () => {
      httpService.post.mockReturnValue(of({ data: { results: [] } }));

      await service.checkActionsForResource(
        makeBaseAuthzRequest({
          checks: [
            {
              resource: 'Foo',
              apiGroup: '',
              entityCollection: 'FooItems',
              version: 'v1',
              actions: ['get'],
            },
          ],
        }),
      );

      const body = httpService.post.mock.calls[0][1];
      expect(body.items[0].resourceAttributes.resource).toBe('fooitems');
    });

    it('merges permissions for multiple checks across resources', async () => {
      httpService.post.mockImplementation((_url, body) => {
        return of({
          data: {
            results: body.items.map((item: any) => ({
              id: item.id,
              allowed: true,
            })),
          },
        });
      });

      const result = await service.checkActionsForResource(
        makeBaseAuthzRequest({
          checks: [
            { resource: 'A', apiGroup: '', entityCollection: 'as', version: 'v1', actions: ['get'] },
            { resource: 'B', apiGroup: '', entityCollection: 'bs', version: 'v1', actions: ['list'] },
          ],
        }),
      );

      expect(result).toHaveLength(2);
      const resources = result!.map((p) => p.resource);
      expect(resources).toContain('A');
      expect(resources).toContain('B');
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
              resource: 'HttpBin',
              apiGroup: 'example.com',
              entityCollection: 'httpbins',
              version: 'v1',
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

    it('sends one batch item per action verb', async () => {
      httpService.post.mockReturnValue(of({ data: { results: [] } }));

      await service.checkActionsForInstance(makeInstanceRequest());

      const body = httpService.post.mock.calls[0][1];
      // 2 actions = 2 items
      expect(body.items).toHaveLength(2);
    });

    it('includes name in resourceAttributes', async () => {
      httpService.post.mockReturnValue(of({ data: { results: [] } }));

      await service.checkActionsForInstance(makeInstanceRequest());

      const body = httpService.post.mock.calls[0][1];
      expect(body.items[0].resourceAttributes.name).toBe('my-bin');
    });

    it('omits name from resourceAttributes when not provided', async () => {
      httpService.post.mockReturnValue(of({ data: { results: [] } }));

      await service.checkActionsForInstance(
        makeInstanceRequest({
          checks: [
            {
              resource: 'HttpBin',
              apiGroup: 'example.com',
              entityCollection: 'httpbins',
              version: 'v1',
              namespace: 'default',
              actions: ['get'],
            },
          ],
        }),
      );

      const body = httpService.post.mock.calls[0][1];
      expect(body.items[0].resourceAttributes.name).toBeUndefined();
    });

    it('returns allowed verbs as Permission[]', async () => {
      httpService.post.mockImplementation((_url, body) => {
        const [getItem, deleteItem] = body.items;
        return of({
          data: {
            results: [
              { id: getItem.id, allowed: true },
              { id: deleteItem.id, allowed: false },
            ],
          },
        });
      });

      const result = await service.checkActionsForInstance(makeInstanceRequest());

      expect(result).toEqual([
        {
          resource: 'HttpBin',
          namespace: 'default',
          name: 'my-bin',
          actions: ['get'],
        },
      ]);
    });

    it('returns empty array when all verbs are denied (not undefined)', async () => {
      httpService.post.mockImplementation((_url, body) => {
        return of({
          data: {
            results: body.items.map((item: any) => ({
              id: item.id,
              allowed: false,
            })),
          },
        });
      });

      const result = await service.checkActionsForInstance(makeInstanceRequest());
      // items were sent but all denied — empty array, NOT undefined
      expect(result).toEqual([]);
    });

    it('returns undefined on HTTP error (fail-open)', async () => {
      httpService.post.mockReturnValue(
        throwError(() => new Error('webhook down')),
      );

      const result = await service.checkActionsForInstance(makeInstanceRequest());
      expect(result).toBeUndefined();
    });

    it('groups verbs by resource|namespace|name key in Permission[]', async () => {
      httpService.post.mockImplementation((_url, body) => {
        return of({
          data: {
            results: body.items.map((item: any) => ({
              id: item.id,
              allowed: true,
            })),
          },
        });
      });

      const result = await service.checkActionsForInstance(
        makeInstanceRequest({
          checks: [
            {
              resource: 'MyResource',
              apiGroup: 'example.com',
              entityCollection: 'myresources',
              version: 'v1',
              namespace: 'my-ns',
              name: 'my-name',
              actions: ['get', 'delete'],
            },
          ],
        }),
      );

      expect(result).toHaveLength(1);
      expect(result![0].resource).toBe('MyResource');
      expect(result![0].namespace).toBe('my-ns');
      expect(result![0].name).toBe('my-name');
      expect(result![0].actions).toContain('get');
      expect(result![0].actions).toContain('delete');
    });

    it('joins organization and accountPath for clusterPath when non-empty', async () => {
      httpService.post.mockReturnValue(of({ data: { results: [] } }));

      await service.checkActionsForInstance(
        makeInstanceRequest({ organization: 'org', accountPath: 'path1' }),
      );

      const body = httpService.post.mock.calls[0][1];
      expect(body.items[0].clusterPath).toBe('root:orgs:org:path1');
    });

    it('uses organization for clusterPath when accountPath is empty', async () => {
      httpService.post.mockReturnValue(of({ data: { results: [] } }));

      await service.checkActionsForInstance(
        makeInstanceRequest({ organization: 'test-org', accountPath: '' }),
      );

      const body = httpService.post.mock.calls[0][1];
      expect(body.items[0].clusterPath).toBe('root:orgs:test-org');
    });
  });
});
