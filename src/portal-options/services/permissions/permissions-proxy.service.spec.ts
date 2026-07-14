import { HttpService } from '@nestjs/axios';
import { ContentConfiguration } from '@openmfp/portal-server-lib';
import { PermissionsProxyService } from './permissions-proxy.service.js';

const mockCheckPermissions = jest.fn();

jest.mock('./adapters/openfga/open-fga.adapter.js', () => ({
  OpenFgaAdapter: jest.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.checkPermissions = mockCheckPermissions;
  }),
}));

function makeCC(nodes: ContentConfiguration['luigiConfigFragment']['data']['nodes'] = []): ContentConfiguration {
  return { name: 'test', creationTimestamp: '', luigiConfigFragment: { data: { nodes } } };
}

const CC_WITH_CHECK = makeCC([{
  context: {
    resourceDefinition: {
      entity: 'Account',
      apiGroup: 'core_platform_mesh_io',
      entityCollection: 'Accounts',
      scope: 'Cluster',
      checkActions: ['get', 'delete'],
    },
  },
}]);

const PERMISSIONS = [{ resource: 'Account', actions: ['get', 'delete'] }];

describe('PermissionsProxyService', () => {
  const http = {} as HttpService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env['OPENMFP_PORTAL_CONTEXT_OPEN_FGA_API_URL'];
  });

  describe('when no adapter is configured', () => {
    it('returns undefined', async () => {
      const svc = new PermissionsProxyService(http);
      expect(await svc.resolvePermissions('tok', 'org', '', [CC_WITH_CHECK])).toBeUndefined();
    });
  });

  describe('when OpenFGA adapter is configured', () => {
    beforeEach(() => {
      process.env['OPENMFP_PORTAL_CONTEXT_OPEN_FGA_API_URL'] = 'http://fga.local';
    });

    it('returns undefined when no CCs have checkActions', async () => {
      const svc = new PermissionsProxyService(http);
      expect(await svc.resolvePermissions('tok', 'org', '', [makeCC()])).toBeUndefined();
    });

    it('returns permissions from adapter', async () => {
      mockCheckPermissions.mockResolvedValue({ accountPath: '', permissions: PERMISSIONS });
      const svc = new PermissionsProxyService(http);
      expect(await svc.resolvePermissions('tok', 'org', '', [CC_WITH_CHECK])).toEqual(PERMISSIONS);
    });

    it('passes token, organization, accountPath to adapter', async () => {
      mockCheckPermissions.mockResolvedValue({ accountPath: 'sub', permissions: [] });
      const svc = new PermissionsProxyService(http);
      await svc.resolvePermissions('my-token', 'my-org', 'sub', [CC_WITH_CHECK]);
      const req = mockCheckPermissions.mock.calls[0][0];
      expect(req.token).toBe('my-token');
      expect(req.organization).toBe('my-org');
      expect(req.accountPath).toBe('sub');
    });

    it('passes scope and namespace from resourceDefinition to adapter', async () => {
      mockCheckPermissions.mockResolvedValue({ accountPath: '', permissions: [] });
      const svc = new PermissionsProxyService(http);
      await svc.resolvePermissions('tok', 'org', '', [CC_WITH_CHECK]);
      const req = mockCheckPermissions.mock.calls[0][0];
      expect(req.checks[0].scope).toBe('Cluster');
    });

    it('returns undefined on adapter error (fail-open)', async () => {
      mockCheckPermissions.mockRejectedValue(new Error('adapter error'));
      const svc = new PermissionsProxyService(http);
      expect(await svc.resolvePermissions('tok', 'org', '', [CC_WITH_CHECK])).toBeUndefined();
    });
  });
});
