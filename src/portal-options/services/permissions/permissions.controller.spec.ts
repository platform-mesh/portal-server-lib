import { UnauthorizedException } from '@nestjs/common';
import { HeaderParserService } from '@openmfp/portal-server-lib';
import { Test, TestingModule } from '@nestjs/testing';
import { mock } from 'jest-mock-extended';
import { PermissionsController } from './permissions.controller.js';
import { PermissionsProxyService } from './permissions-proxy.service.js';
import { AuthorizationRequest, Permission } from './models/permissions.model.js';

function makeBody(
  overrides: Partial<AuthorizationRequest> = {},
): AuthorizationRequest {
  return {
    token: 'ignored-body-token',
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

const request = {} as Request;

describe('PermissionsController', () => {
  let controller: PermissionsController;
  let proxyService: jest.Mocked<PermissionsProxyService>;
  let headerParser: jest.Mocked<HeaderParserService>;

  beforeEach(async () => {
    proxyService = mock<PermissionsProxyService>();
    headerParser = mock<HeaderParserService>();
    headerParser.extractBearerToken.mockReturnValue('header-token');

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionsController],
      providers: [
        { provide: PermissionsProxyService, useValue: proxyService },
        { provide: HeaderParserService, useValue: headerParser },
      ],
    }).compile();

    controller = module.get(PermissionsController);
  });

  describe('checkResource', () => {
    it('extracts the token from the request header and forwards it to the proxy', async () => {
      proxyService.checkResourceInstance.mockResolvedValue([]);

      const body = makeBody();
      await controller.checkResource(request, body);

      expect(headerParser.extractBearerToken).toHaveBeenCalledWith(request);
      expect(proxyService.checkResourceInstance).toHaveBeenCalledWith({
        ...body,
        token: 'header-token',
      });
    });

    it('overrides any token present in the body with the header token', async () => {
      proxyService.checkResourceInstance.mockResolvedValue([]);

      await controller.checkResource(request, makeBody({ token: 'body-token' }));

      const passedReq = proxyService.checkResourceInstance.mock.calls[0][0];
      expect(passedReq.token).toBe('header-token');
    });

    it('throws UnauthorizedException when no bearer token is present', async () => {
      headerParser.extractBearerToken.mockReturnValue(undefined);

      await expect(
        controller.checkResource(request, makeBody()),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(proxyService.checkResourceInstance).not.toHaveBeenCalled();
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

      const result = await controller.checkResource(request, makeBody());

      expect(result).toEqual(proxyResult);
    });

    it('returns empty array when proxy returns undefined (fail-open)', async () => {
      proxyService.checkResourceInstance.mockResolvedValue(undefined);

      const result = await controller.checkResource(request, makeBody());

      expect(result).toEqual([]);
    });

    it('returns empty array when proxy returns empty array', async () => {
      proxyService.checkResourceInstance.mockResolvedValue([]);

      const result = await controller.checkResource(request, makeBody());

      expect(result).toEqual([]);
    });

    it('returns multiple Permission entries from proxy', async () => {
      const permissions: Permission[] = [
        { resource: 'HttpBin', namespace: 'default', name: 'bin-1', actions: ['get'] },
        { resource: 'HttpBin', namespace: 'other', name: 'bin-2', actions: ['delete'] },
      ];
      proxyService.checkResourceInstance.mockResolvedValue(permissions);

      const result = await controller.checkResource(request, makeBody());

      expect(result).toHaveLength(2);
      expect(result).toEqual(permissions);
    });

    it('passes checks array from body unchanged to proxy', async () => {
      proxyService.checkResourceInstance.mockResolvedValue([]);

      const body = makeBody({
        checks: [{ resource: 'Foos', group: 'foo', actions: ['list'] }],
      });
      await controller.checkResource(request, body);

      const passedReq = proxyService.checkResourceInstance.mock.calls[0][0];
      expect(passedReq.checks[0].resource).toBe('Foos');
      expect(passedReq.checks[0].actions).toEqual(['list']);
    });
  });
});
