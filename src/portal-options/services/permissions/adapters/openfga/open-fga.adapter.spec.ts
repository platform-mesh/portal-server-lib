import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { OpenFgaAdapter } from './open-fga.adapter.js';
import { AuthorizationRequest } from '../../models/permissions.model.js';
import { StoreIdResolver } from './store-id.resolver.js';

jest.mock('./store-id.resolver.js', () => ({
  StoreIdResolver: jest.fn(),
}));

const RESOLVED_STORE = {
  storeId: 'store-1',
  authorizationModelId: 'model-1',
  originClusterId: 'origin-cluster',
  generatedClusterId: 'gen-cluster',
};

function makeResolver(resolvedValue: typeof RESOLVED_STORE | undefined = RESOLVED_STORE) {
  return { resolve: jest.fn().mockResolvedValue(resolvedValue) } as unknown as StoreIdResolver;
}

function makeHttpService(postResult: unknown = { result: {} }) {
  const postMock = jest.fn().mockReturnValue(of({ data: postResult }));
  return { http: { post: postMock } as unknown as HttpService, postMock };
}

// JWT with payload { email: 'user@example.com' }
const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20ifQ.sig';

const CLUSTER_REQ: AuthorizationRequest = {
  token: TOKEN,
  organization: 'myorg',
  accountPath: '',
  checks: [{
    resource: 'Account',
    apiGroup: 'core_platform_mesh_io',
    entityCollection: 'Accounts',
    scope: 'Cluster',
    actions: ['get', 'list', 'delete'],
  }],
};

const NAMESPACED_REQ: AuthorizationRequest = {
  token: TOKEN,
  organization: 'myorg',
  accountPath: 'myaccount',
  checks: [{
    resource: 'HttpBin',
    apiGroup: 'orchestrate_platform_mesh_io',
    entityCollection: 'HttpBins',
    scope: 'Namespaced',
    actions: ['list', 'create', 'delete'],
  }],
};

describe('OpenFgaAdapter', () => {
  let adapter: OpenFgaAdapter;
  let postMock: jest.Mock;

  beforeEach(() => {
    const mocks = makeHttpService();
    postMock = mocks.postMock;
    adapter = new OpenFgaAdapter(mocks.http, 'http://fga.local', makeResolver());
  });

  describe('store resolution', () => {
    it('returns empty permissions when store is not resolved', async () => {
      const a = new OpenFgaAdapter({ post: jest.fn() } as any, 'http://fga.local', makeResolver(undefined));
      expect((await a.checkPermissions(CLUSTER_REQ)).permissions).toEqual([]);
    });

    it('returns empty permissions when checks array is empty', async () => {
      expect((await adapter.checkPermissions({ ...CLUSTER_REQ, checks: [] })).permissions).toEqual([]);
    });
  });

  describe('cluster-scoped resource', () => {
    it('uses originClusterId as prefix for org-level (empty accountPath)', async () => {
      await adapter.checkPermissions(CLUSTER_REQ);
      const objects = (postMock.mock.calls[0][1] as any).checks.map((c: any) => c.tuple_key.object);
      expect(objects.every((o: string) => o === 'core_platform-mesh_io_account:origin-cluster/myorg')).toBe(true);
    });

    it('uses generatedClusterId as prefix for sub-account (non-empty accountPath)', async () => {
      await adapter.checkPermissions({ ...CLUSTER_REQ, accountPath: 'sub' });
      const objects = (postMock.mock.calls[0][1] as any).checks.map((c: any) => c.tuple_key.object);
      expect(objects.every((o: string) => o === 'core_platform-mesh_io_account:gen-cluster/sub')).toBe(true);
    });

    it('sends compound relation for list/create/watch', async () => {
      await adapter.checkPermissions({ ...CLUSTER_REQ, checks: [{ ...CLUSTER_REQ.checks[0], actions: ['list'] }] });
      expect((postMock.mock.calls[0][1] as any).checks[0].tuple_key.relation).toBe('list_core_platform-mesh_io_accounts');
    });

    it('sends bare verb for get/delete/update', async () => {
      await adapter.checkPermissions({ ...CLUSTER_REQ, checks: [{ ...CLUSTER_REQ.checks[0], actions: ['delete'] }] });
      expect((postMock.mock.calls[0][1] as any).checks[0].tuple_key.relation).toBe('delete');
    });

    it('sends no contextual tuples for cluster-scoped resources', async () => {
      await adapter.checkPermissions(CLUSTER_REQ);
      expect((postMock.mock.calls[0][1] as any).checks.every((c: any) => !c.contextual_tuples)).toBe(true);
    });
  });

  describe('namespaced resource', () => {
    it('sends compound relation against namespace object for list', async () => {
      await adapter.checkPermissions({ ...NAMESPACED_REQ, checks: [{ ...NAMESPACED_REQ.checks[0], actions: ['list'] }] });
      const check = (postMock.mock.calls[0][1] as any).checks[0];
      expect(check.tuple_key.relation).toBe('list_orchestrate_platform-mesh_io_httpbins');
      expect(check.tuple_key.object).toBe('core_namespace:gen-cluster/default');
    });

    it('sends bare verb against namespace object for delete', async () => {
      await adapter.checkPermissions({ ...NAMESPACED_REQ, checks: [{ ...NAMESPACED_REQ.checks[0], actions: ['delete'] }] });
      const check = (postMock.mock.calls[0][1] as any).checks[0];
      expect(check.tuple_key.relation).toBe('delete');
      expect(check.tuple_key.object).toBe('core_namespace:gen-cluster/default');
    });

    it('attaches contextual parent tuple for all namespaced checks', async () => {
      await adapter.checkPermissions(NAMESPACED_REQ);
      (postMock.mock.calls[0][1] as any).checks.forEach((c: any) => {
        expect(c.contextual_tuples.tuple_keys).toEqual([{
          object: 'core_namespace:gen-cluster/default',
          relation: 'parent',
          user: 'core_platform-mesh_io_account:gen-cluster/myaccount',
        }]);
      });
    });

    it('uses namespace from check when provided', async () => {
      await adapter.checkPermissions({ ...NAMESPACED_REQ, checks: [{ ...NAMESPACED_REQ.checks[0], namespace: 'kube-system', actions: ['list'] }] });
      expect((postMock.mock.calls[0][1] as any).checks[0].tuple_key.object).toBe('core_namespace:gen-cluster/kube-system');
    });

    it('falls back to "default" namespace when namespace is null', async () => {
      await adapter.checkPermissions({ ...NAMESPACED_REQ, checks: [{ ...NAMESPACED_REQ.checks[0], namespace: null, actions: ['list'] }] });
      expect((postMock.mock.calls[0][1] as any).checks[0].tuple_key.object).toBe('core_namespace:gen-cluster/default');
    });
  });

  describe('apiGroup normalization', () => {
    it('preserves dashes: platform_mesh → platform-mesh', async () => {
      await adapter.checkPermissions({ ...NAMESPACED_REQ, checks: [{ ...NAMESPACED_REQ.checks[0], actions: ['list'] }] });
      expect((postMock.mock.calls[0][1] as any).checks[0].tuple_key.relation).toContain('platform-mesh');
    });

    it('uses "core" group for empty apiGroup', async () => {
      await adapter.checkPermissions({ ...CLUSTER_REQ, checks: [{ resource: 'Namespace', apiGroup: '', entityCollection: 'Namespaces', scope: 'Cluster', actions: ['list'] }] });
      expect((postMock.mock.calls[0][1] as any).checks[0].tuple_key.relation).toBe('list_core_namespaces');
    });
  });

  describe('checkActions: All', () => {
    it('uses all k8s verbs when checkActions is "All"', async () => {
      await adapter.checkPermissions({ ...CLUSTER_REQ, checks: [{ ...CLUSTER_REQ.checks[0], actions: 'All' }] });
      const relations = (postMock.mock.calls[0][1] as any).checks.map((c: any) => c.tuple_key.relation);
      expect(relations).toContain('get');
      expect(relations).toContain('delete');
      expect(relations.some((r: string) => r.startsWith('list_'))).toBe(true);
      expect(relations.some((r: string) => r.startsWith('create_'))).toBe(true);
    });
  });

  describe('results mapping', () => {
    it('collects allowed actions per resource', async () => {
      postMock.mockImplementation((_url: string, body: any) => {
        const result: Record<string, { allowed: boolean }> = {};
        for (const check of body.checks) {
          result[check.correlation_id] = { allowed: check.tuple_key.relation === 'get' };
        }
        return of({ data: { result } });
      });
      const result = await adapter.checkPermissions({ ...CLUSTER_REQ, checks: [{ ...CLUSTER_REQ.checks[0], actions: ['get', 'delete'] }] });
      expect(result.permissions).toEqual([{ resource: 'Account', actions: ['get'] }]);
    });

    it('returns empty permissions when all checks are denied', async () => {
      expect((await adapter.checkPermissions(CLUSTER_REQ)).permissions).toEqual([]);
    });

    it('returns empty permissions on HTTP error (fail-open)', async () => {
      postMock.mockReturnValue(throwError(() => new Error('network error')));
      expect((await adapter.checkPermissions(CLUSTER_REQ)).permissions).toEqual([]);
    });
  });

  describe('user identifier', () => {
    it('extracts email from JWT token', async () => {
      await adapter.checkPermissions(CLUSTER_REQ);
      expect((postMock.mock.calls[0][1] as any).checks[0].tuple_key.user).toBe('user:user@example.com');
    });

    it('uses empty string when token is malformed', async () => {
      await adapter.checkPermissions({ ...CLUSTER_REQ, token: 'bad.token' });
      expect((postMock.mock.calls[0][1] as any).checks[0].tuple_key.user).toBe('user:');
    });
  });

  describe('authorization_model_id', () => {
    it('includes authorization_model_id when set', async () => {
      await adapter.checkPermissions(CLUSTER_REQ);
      expect((postMock.mock.calls[0][1] as any).authorization_model_id).toBe('model-1');
    });

    it('omits authorization_model_id when empty', async () => {
      const a = new OpenFgaAdapter({ post: postMock } as any, 'http://fga.local', makeResolver({ ...RESOLVED_STORE, authorizationModelId: '' }));
      await a.checkPermissions(CLUSTER_REQ);
      expect((postMock.mock.calls[0][1] as any)).not.toHaveProperty('authorization_model_id');
    });
  });
});

