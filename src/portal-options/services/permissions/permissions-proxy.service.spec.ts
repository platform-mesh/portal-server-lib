import { ContentConfiguration } from '@openmfp/portal-server-lib';
import { mock } from 'jest-mock-extended';
import { AuthzWebhookService } from './adapters/authz-webhook.service.js';
import {
  AuthorizationRequest,
  Permission,
  PermissionsDefinition,
} from './models/permissions.model.js';
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

function makePd(
  overrides: Partial<PermissionsDefinition> = {},
): PermissionsDefinition {
  return {
    group: 'core.platform-mesh.io',
    resource: 'Accounts',
    entityActions: ['get', 'delete'],
    resourceActions: ['create', 'list'],
    entityContextKey: 'entityName',
    ...overrides,
  };
}

function makeNode(rd: Record<string, unknown>) {
  return { context: { resourceDefinition: rd } };
}

const CC_WITH_CHECK = makeCC([
  makeNode({ entity: 'Account', permissionsDefinition: makePd() }),
]);

const CC_WITHOUT_PD = makeCC([makeNode({ entity: 'NoCheck' })]);

const PERMISSIONS: Permission[] = [
  { resource: 'Accounts', actions: ['create', 'list'] },
];

function makeAuthzRequest(
  overrides: Partial<AuthorizationRequest> = {},
): AuthorizationRequest {
  return {
    token: 'my-token',
    organization: 'my-org',
    accountPath: 'sub-path',
    checks: [
      {
        resource: 'HttpBins',
        group: 'example.com',
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
    it('returns undefined when no resource definitions have a permissionsDefinition', async () => {
      const result = await svc.resolvePermissions('tok', 'org', '', [
        CC_WITHOUT_PD,
      ]);
      expect(result).toBeUndefined();
      expect(authzWebhook.checkActionsForResource).not.toHaveBeenCalled();
    });

    it('returns undefined when content configurations are empty', async () => {
      const result = await svc.resolvePermissions('tok', 'org', '', []);
      expect(result).toBeUndefined();
    });

    it('returns undefined when permissionsDefinition has empty resourceActions', async () => {
      const cc = makeCC([
        makeNode({
          entity: 'Account',
          permissionsDefinition: makePd({ resourceActions: [] }),
        }),
      ]);

      const result = await svc.resolvePermissions('tok', 'org', '', [cc]);

      expect(result).toBeUndefined();
      expect(authzWebhook.checkActionsForResource).not.toHaveBeenCalled();
    });

    it('delegates to authzWebhook.checkActionsForResource with a check built from permissionsDefinition', async () => {
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
          {
            resource: 'Accounts',
            group: 'core.platform-mesh.io',
            actions: ['create', 'list'],
          },
        ],
      });
    });

    it('passes token, organization, accountPath to webhook', async () => {
      authzWebhook.checkActionsForResource.mockResolvedValue([]);

      await svc.resolvePermissions('my-token', 'my-org', 'sub', [
        CC_WITH_CHECK,
      ]);

      const req = authzWebhook.checkActionsForResource.mock.calls[0][0];
      expect(req.token).toBe('my-token');
      expect(req.organization).toBe('my-org');
      expect(req.accountPath).toBe('sub');
    });

    it('returns undefined when webhook returns undefined', async () => {
      authzWebhook.checkActionsForResource.mockResolvedValue(undefined);

      const result = await svc.resolvePermissions('tok', 'org', '', [
        CC_WITH_CHECK,
      ]);

      expect(result).toBeUndefined();
    });

    it('filters out resource definitions whose permissionsDefinition has no resourceActions', async () => {
      authzWebhook.checkActionsForResource.mockResolvedValue([]);
      const mixed = makeCC([
        makeNode({
          entity: 'NoActions',
          permissionsDefinition: makePd({
            resource: 'NoActions',
            resourceActions: [],
          }),
        }),
        makeNode({
          entity: 'WithCheck',
          permissionsDefinition: makePd({
            resource: 'WithChecks',
            resourceActions: ['get'],
          }),
        }),
      ]);

      await svc.resolvePermissions('tok', 'org', '', [mixed]);

      const req = authzWebhook.checkActionsForResource.mock.calls[0][0];
      expect(req.checks).toHaveLength(1);
      expect(req.checks[0].resource).toBe('WithChecks');
      expect(req.checks[0].actions).toEqual(['get']);
    });
  });

  describe('checkResourceInstance', () => {
    it('delegates AuthorizationRequest directly to authzWebhook.checkActionsForInstance', async () => {
      const mockResponse: Permission[] = [
        {
          resource: 'HttpBins',
          namespace: 'default',
          name: 'my-bin',
          actions: ['get'],
        },
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
        {
          resource: 'HttpBins',
          namespace: 'default',
          name: 'my-bin',
          actions: ['get', 'list'],
        },
      ];
      authzWebhook.checkActionsForInstance.mockResolvedValue(permissions);

      const result = await svc.checkResourceInstance(makeAuthzRequest());

      expect(result).toEqual(permissions);
    });
  });
});
