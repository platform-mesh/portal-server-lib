import { Test, TestingModule } from '@nestjs/testing';
import { mock } from 'jest-mock-extended';
import { PermissionsController } from './permissions.controller.js';
import { PermissionsProxyService } from './permissions-proxy.service.js';
import { AuthorizationRequest, Permission } from './models/permissions.model.js';

function makeRequest(overrides: Partial<AuthorizationRequest> = {}): AuthorizationRequest {
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
        actions: ['get', 'delete'],
      },
    ],
    ...overrides,
  };
}

describe('PermissionsController', () => {
  let controller: PermissionsController;
  let proxyService: jest.Mocked<PermissionsProxyService>;

  beforeEach(async () => {
    proxyService = mock<PermissionsProxyService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionsController],
      providers: [
        { provide: PermissionsProxyService, useValue: proxyService },
      ],
    }).compile();

    controller = module.get(PermissionsController);
  });

  describe('checkResource', () => {
    it('passes the request body to the proxy service', async () => {
      proxyService.checkResourceInstance.mockResolvedValue([
        { resource: 'HttpBin', actions: ['get'] },
      ]);

      const req = makeRequest();
      await controller.checkResource(req);

      expect(proxyService.checkResourceInstance).toHaveBeenCalledWith(req);
    });

    it('returns the proxy result when defined', async () => {
      const proxyResult: Permission[] = [
        {
          resource: 'HttpBin',
          namespace: 'default',
          name: 'my-bin',
          actions: ['get', 'delete'],
        },
      ];
      proxyService.checkResourceInstance.mockResolvedValue(proxyResult);

      const result = await controller.checkResource(makeRequest());

      expect(result).toEqual(proxyResult);
    });

    it('returns empty array when proxy returns undefined (fail-open)', async () => {
      proxyService.checkResourceInstance.mockResolvedValue(undefined);

      const result = await controller.checkResource(makeRequest());

      expect(result).toEqual([]);
    });

    it('returns empty array when proxy returns empty array', async () => {
      proxyService.checkResourceInstance.mockResolvedValue([]);

      const result = await controller.checkResource(makeRequest());

      expect(result).toEqual([]);
    });

    it('returns multiple Permission entries from proxy', async () => {
      const permissions: Permission[] = [
        { resource: 'HttpBin', namespace: 'default', name: 'bin-1', actions: ['get'] },
        { resource: 'HttpBin', namespace: 'other', name: 'bin-2', actions: ['delete'] },
      ];
      proxyService.checkResourceInstance.mockResolvedValue(permissions);

      const result = await controller.checkResource(makeRequest());

      expect(result).toHaveLength(2);
      expect(result).toEqual(permissions);
    });

    it('passes checks array from body unchanged to proxy', async () => {
      proxyService.checkResourceInstance.mockResolvedValue([]);

      const req = makeRequest({
        checks: [
          { resource: 'Foo', apiGroup: 'foo', entityCollection: 'foos', version: 'v1', actions: ['list'] },
        ],
      });
      await controller.checkResource(req);

      const passedReq = proxyService.checkResourceInstance.mock.calls[0][0];
      expect(passedReq.checks[0].resource).toBe('Foo');
      expect(passedReq.checks[0].actions).toEqual(['list']);
    });
  });
});
