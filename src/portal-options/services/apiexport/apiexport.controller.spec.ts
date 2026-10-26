import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { mock } from 'jest-mock-extended';
import { ApiExportService } from './apiexport.service.js';
import { ApiExportController } from './apiexport.controller.js';
import { WORKSPACE_PROVIDERS } from './constants.js';

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

const ORG = 'test-org';
const PROVIDER_WS_SEGMENT = 'httpbin';
const PROVIDER_WS = `${WORKSPACE_PROVIDERS}:${PROVIDER_WS_SEGMENT}`;

describe('ApiExportController', () => {
  let controller: ApiExportController;
  const apiExportService = mock<ApiExportService>();

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ApiExportController(apiExportService);
  });

  describe('listApiExports', () => {
    it('returns items from service', async () => {
      const exports = [{ apiVersion: 'apis.kcp.io/v1alpha1', kind: 'APIExport', metadata: { name: 'alpha' }, enabled: true, clusterPath: PROVIDER_WS }];
      (apiExportService.listApiExports as jest.Mock).mockResolvedValue(exports);

      const result = await controller.listApiExports(ORG);

      expect(result).toEqual({ items: exports });
      expect(apiExportService.listApiExports).toHaveBeenCalledWith(ORG);
    });

    it('throws BadRequestException when organization is missing', async () => {
      await expect(controller.listApiExports(undefined as unknown as string)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when organization contains invalid characters', async () => {
      await expect(controller.listApiExports('root:orgs')).rejects.toThrow(BadRequestException);
    });
  });

  describe('enableApiExport', () => {
    it('calls service with clusterPath and returns no content', async () => {
      (apiExportService.enableApiExport as jest.Mock).mockResolvedValue(undefined);

      await expect(controller.enableApiExport(ORG, PROVIDER_WS_SEGMENT, 'alpha')).resolves.toBeUndefined();

      expect(apiExportService.enableApiExport).toHaveBeenCalledWith(ORG, 'alpha', PROVIDER_WS);
    });

    it('throws BadRequestException when organization is missing', async () => {
      await expect(controller.enableApiExport(undefined as unknown as string, PROVIDER_WS_SEGMENT, 'alpha')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when providerWorkspace is missing', async () => {
      await expect(controller.enableApiExport(ORG, undefined as unknown as string, 'alpha')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when service returns 404', async () => {
      const err = Object.assign(new Error('not found'), { statusCode: 404 });
      (apiExportService.enableApiExport as jest.Mock).mockRejectedValue(err);
      await expect(controller.enableApiExport(ORG, PROVIDER_WS_SEGMENT, 'alpha')).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when service returns 409', async () => {
      const err = Object.assign(new Error('conflict'), { statusCode: 409 });
      (apiExportService.enableApiExport as jest.Mock).mockRejectedValue(err);
      await expect(controller.enableApiExport(ORG, PROVIDER_WS_SEGMENT, 'alpha')).rejects.toThrow(ConflictException);
    });

    it('rethrows unexpected errors', async () => {
      const err = new Error('internal error');
      (apiExportService.enableApiExport as jest.Mock).mockRejectedValue(err);
      await expect(controller.enableApiExport(ORG, PROVIDER_WS_SEGMENT, 'alpha')).rejects.toThrow(err);
    });
  });

  describe('disableApiExport', () => {
    it('calls service and returns no content', async () => {
      (apiExportService.disableApiExport as jest.Mock).mockResolvedValue(undefined);
      await expect(controller.disableApiExport(ORG, 'alpha')).resolves.toBeUndefined();
      expect(apiExportService.disableApiExport).toHaveBeenCalledWith(ORG, 'alpha');
    });

    it('throws BadRequestException when organization is missing', async () => {
      await expect(controller.disableApiExport(undefined as unknown as string, 'alpha')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when service returns 404', async () => {
      const err = Object.assign(new Error('not found'), { statusCode: 404 });
      (apiExportService.disableApiExport as jest.Mock).mockRejectedValue(err);
      await expect(controller.disableApiExport(ORG, 'alpha')).rejects.toThrow(NotFoundException);
    });

    it('rethrows unexpected errors', async () => {
      const err = new Error('internal error');
      (apiExportService.disableApiExport as jest.Mock).mockRejectedValue(err);
      await expect(controller.disableApiExport(ORG, 'alpha')).rejects.toThrow(err);
    });
  });
});
