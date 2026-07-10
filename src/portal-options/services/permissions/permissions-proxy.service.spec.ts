import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { ContentConfiguration } from '@openmfp/portal-server-lib';
import { PermissionsProxyService } from './permissions-proxy.service.js';

const mockFgaCheckPermissions = jest.fn();
const mockRbacCheckPermissions = jest.fn();

jest.mock('./open-fga.adapter.js', () => ({
  OpenFgaAdapter: jest.fn().mockImplementation(() => ({
    checkPermissions: mockFgaCheckPermissions,
  })),
}));

jest.mock('./rbac.adapter.js', () => ({
  RbacAdapter: jest.fn().mockImplementation(() => ({
    checkPermissions: mockRbacCheckPermissions,
  })),
}));

function makeCC(
  nodes: ContentConfiguration['luigiConfigFragment']['data']['nodes'] = [],
): ContentConfiguration {
  return {
    name: 'test',
    creationTimestamp: '',
    luigiConfigFragment: { data: { nodes } },
  };
}

function makeHttpService(): jest.Mocked<HttpService> {
  return {
    post: jest.fn().mockReturnValue(of({ data: { result: {} } })),
    get: jest.fn().mockReturnValue(of({ data: {} })),
  } as unknown as jest.Mocked<HttpService>;
}

const CC_WITH_CHECK = makeCC([
  { context: { resourceDefinition: { entity: 'pods', checkActions: ['get'] } } },
]);

describe('PermissionsProxyService', () => {
  let http: jest.Mocked<HttpService>;

  beforeEach(() => {
    http = makeHttpService();
    delete process.env['OPENMFP_PORTAL_CONTEXT_OPEN_FGA_API_URL'];
    delete process.env['OPENMFP_PORTAL_CONTEXT_OPEN_RBAC_API_URL'];
    delete process.env['OPENMFP_PORTAL_CONTEXT_OPEN_FGA_STORE_ID'];
    mockFgaCheckPermissions.mockReset();
    mockRbacCheckPermissions.mockReset();
  });

  describe('when no adapter is configured', () => {
    it('returns undefined regardless of content configurations', async () => {
      const service = new PermissionsProxyService(http);
      const result = await service.resolvePermissions('token', 'user-1', 'acc1', [CC_WITH_CHECK]);
      expect(result).toBeUndefined();
    });

    it('returns undefined when no checks are extracted', async () => {
      const service = new PermissionsProxyService(http);
      const result = await service.resolvePermissions('token', 'user-1', 'acc1', [makeCC()]);
      expect(result).toBeUndefined();
    });
  });

  describe('when OpenFGA adapter is configured', () => {
    beforeEach(() => {
      process.env['OPENMFP_PORTAL_CONTEXT_OPEN_FGA_API_URL'] = 'http://fga.local';
      process.env['OPENMFP_PORTAL_CONTEXT_OPEN_FGA_STORE_ID'] = 'store-1';
    });

    it('returns undefined when no checks are extracted', async () => {
      const service = new PermissionsProxyService(http);
      const result = await service.resolvePermissions('token', 'user-1', 'acc1', [makeCC()]);
      expect(result).toBeUndefined();
    });

    it('returns permissions from adapter', async () => {
      mockFgaCheckPermissions.mockResolvedValue({
        userId: 'user-1',
        accountPath: 'acc1',
        permissions: [{ resource: 'pods', actions: ['get'] }],
      });

      const service = new PermissionsProxyService(http);
      const result = await service.resolvePermissions('token', 'user-1', 'acc1', [CC_WITH_CHECK]);
      expect(result).toEqual([{ resource: 'pods', actions: ['get'] }]);
    });

    it('returns undefined on adapter error (fail-open)', async () => {
      mockFgaCheckPermissions.mockRejectedValue(new Error('adapter error'));

      const service = new PermissionsProxyService(http);
      const result = await service.resolvePermissions('token', 'user-1', 'acc1', [CC_WITH_CHECK]);
      expect(result).toBeUndefined();
    });
  });

  describe('when RBAC adapter is configured', () => {
    beforeEach(() => {
      process.env['OPENMFP_PORTAL_CONTEXT_OPEN_RBAC_API_URL'] = 'http://k8s.local';
    });

    it('returns permissions from RBAC adapter', async () => {
      mockRbacCheckPermissions.mockResolvedValue({
        userId: 'user-1',
        accountPath: 'acc1',
        permissions: [{ resource: 'pods', actions: ['get'] }],
      });

      const service = new PermissionsProxyService(http);
      const result = await service.resolvePermissions('token', 'user-1', 'acc1', [CC_WITH_CHECK]);
      expect(result).toEqual([{ resource: 'pods', actions: ['get'] }]);
    });
  });
});
