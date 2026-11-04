import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { mock } from 'jest-mock-extended';
import { ApiExportService } from './apiexport.service.js';
import { ApiExportController } from './apiexport.controller.js';
import { PlatformAdminGuard } from '../platform-admin/platform-admin.guard.js';
import { AuthzWebhookService } from '../permissions/adapters/authz-webhook.service.js';
import { HeaderParserService } from '@openmfp/portal-server-lib';

jest.mock('@kubernetes/client-node', () => {
  class KubeConfig {
    loadFromFile = jest.fn();
    getCurrentCluster = jest.fn().mockReturnValue({ server: 'https://kcp.example.com', name: 'test' });
    makeApiClient = jest.fn();
    addUser = jest.fn();
    addContext = jest.fn();
    setCurrentContext = jest.fn();
  }
  class CustomObjectsApi {}
  class CoreV1Api {}
  return { KubeConfig, CustomObjectsApi, CoreV1Api };
});

jest.mock('@kubernetes/client-node/dist/gen/middleware.js', () => ({
  PromiseMiddlewareWrapper: jest.fn(),
}));

describe('ApiExportController', () => {
  let controller: ApiExportController;
  const apiExportService = mock<ApiExportService>();

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ApiExportController(apiExportService);
  });

  describe('listApiExports', () => {
    it('returns items from service', async () => {
      const exports = [
        {
          metadata: { name: 'alpha' },
          clusterPath: 'root:providers:httpbin',
          allowRules: [{ path: 'root:orgs:demo', includeDescendants: false }],
        },
      ];
      (apiExportService.listApiExports as jest.Mock).mockResolvedValue(exports);

      const result = await controller.listApiExports();

      expect(result).toEqual({ items: exports });
      expect(apiExportService.listApiExports).toHaveBeenCalledWith();
    });

    it('propagates service errors', async () => {
      (apiExportService.listApiExports as jest.Mock).mockRejectedValue(
        new InternalServerErrorException('kcp down'),
      );
      await expect(controller.listApiExports()).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('setApiExportPolicy', () => {
    const validBody = {
      clusterPath: 'root:providers:httpbin',
      allowRules: [{ path: 'root:orgs:demo', includeDescendants: false }],
    };

    it('calls service with name and body', async () => {
      (apiExportService.setApiExportPolicy as jest.Mock).mockResolvedValue(undefined);

      await expect(controller.setApiExportPolicy('alpha', validBody)).resolves.toBeUndefined();
      expect(apiExportService.setApiExportPolicy).toHaveBeenCalledWith('alpha', validBody);
    });

    it('rejects non-object body', async () => {
      await expect(controller.setApiExportPolicy('alpha', null)).rejects.toThrow(BadRequestException);
      await expect(controller.setApiExportPolicy('alpha', 'string')).rejects.toThrow(BadRequestException);
    });

    it('rejects body without clusterPath string', async () => {
      await expect(
        controller.setApiExportPolicy('alpha', { clusterPath: 123, allowRules: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects body without allowRules array', async () => {
      await expect(
        controller.setApiExportPolicy('alpha', { clusterPath: 'root:providers:x', allowRules: null }),
      ).rejects.toThrow(BadRequestException);
    });

    it('propagates service errors unchanged', async () => {
      (apiExportService.setApiExportPolicy as jest.Mock).mockRejectedValue(
        new InternalServerErrorException('unexpected'),
      );
      await expect(controller.setApiExportPolicy('alpha', validBody)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('accepts empty allowRules (delete intent)', async () => {
      (apiExportService.setApiExportPolicy as jest.Mock).mockResolvedValue(undefined);
      await expect(
        controller.setApiExportPolicy('alpha', { clusterPath: 'root:providers:httpbin', allowRules: [] }),
      ).resolves.toBeUndefined();
    });
  });
});

describe('PlatformAdminGuard', () => {
  const authzWebhook = mock<AuthzWebhookService>();
  const headerParser = mock<HeaderParserService>();

  let guard: PlatformAdminGuard;

  beforeEach(() => {
    jest.resetAllMocks();
    guard = new PlatformAdminGuard(authzWebhook, headerParser);
  });

  const makeContext = (token: string | undefined) => ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization: token ? `Bearer ${token}` : undefined } }),
    }),
  });

  it('throws UnauthorizedException when no token', async () => {
    (headerParser.extractBearerToken as jest.Mock).mockReturnValue(undefined);
    await expect(guard.canActivate(makeContext(undefined) as any)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws ForbiddenException when webhook returns undefined (unavailable)', async () => {
    (headerParser.extractBearerToken as jest.Mock).mockReturnValue('tok');
    (authzWebhook.checkActionsForInstance as jest.Mock).mockResolvedValue(undefined);
    await expect(guard.canActivate(makeContext('tok') as any)).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when permissions do not include delete accounts', async () => {
    (headerParser.extractBearerToken as jest.Mock).mockReturnValue('tok');
    (authzWebhook.checkActionsForInstance as jest.Mock).mockResolvedValue([
      { resource: 'accounts', actions: ['get'] },
    ]);
    await expect(guard.canActivate(makeContext('tok') as any)).rejects.toThrow(ForbiddenException);
  });

  it('returns true when delete accounts permission is granted', async () => {
    (headerParser.extractBearerToken as jest.Mock).mockReturnValue('tok');
    (authzWebhook.checkActionsForInstance as jest.Mock).mockResolvedValue([
      { resource: 'accounts', actions: ['delete'] },
    ]);
    await expect(guard.canActivate(makeContext('tok') as any)).resolves.toBe(true);
  });
});
