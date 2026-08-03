import { ContentConfiguration } from '@openmfp/portal-server-lib';
import { mock } from 'jest-mock-extended';
import { AuthzWebhookService } from './authz-webhook.service.js';
import { AuthorizationRequest, Permission } from './models/permissions.model.js';
import { PermissionsProxyService } from './permissions-proxy.service.js';

function makeCC(
  nodes: ContentConfiguration['luigiConfigFragment']['data']['nodes'] = [],
): ContentConfiguration {
  return {
    name: 'test',
    creationTimestamp: '',
    luigiConfigFragment: { data: { nodes } },
  };
}

const CC_WITH_CHECK = makeCC([
  {
    context: {
      resourceDefinition: {
        entity: 'Account',
        apiGroup: 'core_platform_mesh_io',
        entityCollection: 'Accounts',
        scope: 'Cluster',
        version: 'v1alpha1',
        checkActionsForResource: ['get', 'delete'],
      },
    },
  },
]);

const CC_WITHOUT_CHECK = makeCC([
  {
    context: {
      resourceDefinition: {
        entity: 'NoCheck',
        apiGroup: 'core_platform_mesh_io',
        entityCollection: 'NoChecks',
        // no checkActionsForResource
      },
    },
  },
]);

const PERMISSIONS: Permission[] = [
  { resource: 'Account', actions: ['get', 'delete'] },
];

function makeAuthzRequest(overrides: Partial<AuthorizationRequest> = {}): AuthorizationRequest {
  return {
    token: 'my-token',
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
        actions: ['get', 'list'],
      },
    ],
    ...overrides,
  };
}

describe('PermissionsProxyService', () => {
  let authzWebhook: jest.Mocked<AuthzWebhookService>;
  let svc: PermissionsProxyService;

  beforeEach(() => {
    authzWebhook = mock<AuthzWebhookService>();
    svc = new PermissionsProxyService(authzWebhook);
  });

  describe('resolvePermissions', () => {
    it('returns undefined when no resource definitions have checkActionsForResource', async () => {
      const result = await svc.resolvePermissions(
        'tok',
        'org',
        '',
        [CC_WITHOUT_CHECK],
      );
      expect(result).toBeUndefined();
      expect(authzWebhook.checkActionsForResource).not.toHaveBeenCalled();
    });

    it('returns undefined when content configurations are empty', async () => {
      const result = await svc.resolvePermissions('tok', 'org', '', []);
      expect(result).toBeUndefined();
    });

    it('delegates to authzWebhook.checkActionsForResource with correct request', async () => {
      authzWebhook.checkActionsForResource.mockResolvedValue(PERMISSIONS);

      const result = await svc.resolvePermissions(
        'my-token',
        'my-org',
        'sub-path',
        [CC_WITH_CHECK],
      );

      expect(result).toEqual(PERMISSIONS);
      expect(authzWebhook.checkActionsForResource).toHaveBeenCalledWith({
        token: 'my-token',
        organization: 'my-org',
        accountPath: 'sub-path',
        checks: [
          expect.objectContaining({
            resource: 'Account',
            apiGroup: 'core_platform_mesh_io',
            entityCollection: 'Accounts',
            version: 'v1alpha1',
            scope: 'Cluster',
            actions: ['get', 'delete'],
          }),
        ],
      });
    });

    it('passes token, organization, accountPath to webhook', async () => {
      authzWebhook.checkActionsForResource.mockResolvedValue([]);

      await svc.resolvePermissions('my-token', 'my-org', 'sub', [CC_WITH_CHECK]);

      const req = authzWebhook.checkActionsForResource.mock.calls[0][0];
      expect(req.token).toBe('my-token');
      expect(req.organization).toBe('my-org');
      expect(req.accountPath).toBe('sub');
    });

    it('defaults version to v1 when not set on resource definition', async () => {
      authzWebhook.checkActionsForResource.mockResolvedValue([]);
      const ccNoVersion = makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Foo',
              apiGroup: 'foo',
              entityCollection: 'foos',
              checkActionsForResource: ['get'],
            },
          },
        },
      ]);

      await svc.resolvePermissions('tok', 'org', '', [ccNoVersion]);

      const req = authzWebhook.checkActionsForResource.mock.calls[0][0];
      expect(req.checks[0].version).toBe('v1');
    });

    it('defaults scope to Cluster when not set on resource definition', async () => {
      authzWebhook.checkActionsForResource.mockResolvedValue([]);
      const ccNoScope = makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'Bar',
              entityCollection: 'bars',
              checkActionsForResource: ['list'],
            },
          },
        },
      ]);

      await svc.resolvePermissions('tok', 'org', '', [ccNoScope]);

      const req = authzWebhook.checkActionsForResource.mock.calls[0][0];
      expect(req.checks[0].scope).toBe('Cluster');
    });

    it('returns undefined when webhook returns undefined', async () => {
      authzWebhook.checkActionsForResource.mockResolvedValue(undefined);

      const result = await svc.resolvePermissions('tok', 'org', '', [CC_WITH_CHECK]);

      expect(result).toBeUndefined();
    });

    it('filters out resource definitions without checkActionsForResource', async () => {
      authzWebhook.checkActionsForResource.mockResolvedValue([]);
      const mixed = makeCC([
        {
          context: {
            resourceDefinition: {
              entity: 'NoCheck',
              entityCollection: 'nochecks',
            },
          },
        },
        {
          context: {
            resourceDefinition: {
              entity: 'WithCheck',
              entityCollection: 'withchecks',
              checkActionsForResource: ['get'],
            },
          },
        },
      ]);

      await svc.resolvePermissions('tok', 'org', '', [mixed]);

      const req = authzWebhook.checkActionsForResource.mock.calls[0][0];
      expect(req.checks).toHaveLength(1);
      expect(req.checks[0].resource).toBe('WithCheck');
    });
  });

  describe('checkResourceInstance', () => {
    it('delegates AuthorizationRequest directly to authzWebhook.checkActionsForInstance', async () => {
      const mockResponse: Permission[] = [
        { resource: 'HttpBin', namespace: 'default', name: 'my-bin', actions: ['get'] },
      ];
      authzWebhook.checkActionsForInstance.mockResolvedValue(mockResponse);

      const req = makeAuthzRequest();
      const result = await svc.checkResourceInstance(req);

      expect(result).toEqual(mockResponse);
      expect(authzWebhook.checkActionsForInstance).toHaveBeenCalledWith(req);
    });

    it('returns undefined when webhook returns undefined', async () => {
      authzWebhook.checkActionsForInstance.mockResolvedValue(undefined);

      const result = await svc.checkResourceInstance(makeAuthzRequest());

      expect(result).toBeUndefined();
    });

    it('returns empty array when webhook returns empty array', async () => {
      authzWebhook.checkActionsForInstance.mockResolvedValue([]);

      const result = await svc.checkResourceInstance(makeAuthzRequest());

      expect(result).toEqual([]);
    });

    it('returns Permission[] when webhook returns results', async () => {
      const permissions: Permission[] = [
        { resource: 'HttpBin', namespace: 'default', name: 'my-bin', actions: ['get', 'list'] },
      ];
      authzWebhook.checkActionsForInstance.mockResolvedValue(permissions);

      const result = await svc.checkResourceInstance(makeAuthzRequest());

      expect(result).toEqual(permissions);
    });
  });
});
