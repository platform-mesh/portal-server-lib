import { NotFoundException } from '@nestjs/common';
import { mock } from 'jest-mock-extended';
import { ApiExportService } from './apiexport.service.js';
import { ApiExportController } from './apiexport.controller.js';

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

describe('ApiExportController', () => {
  let controller: ApiExportController;
  const apiExportService = mock<ApiExportService>();

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new ApiExportController(apiExportService);
  });

  describe('listApiExports', () => {
    it('returns items from service', async () => {
      const exports = [{ apiVersion: 'apis.kcp.io/v1alpha1', kind: 'APIExport', metadata: { name: 'alpha' }, enabled: true }];
      (apiExportService.listApiExports as jest.Mock).mockResolvedValue(exports);

      const result = await controller.listApiExports(ORG);

      expect(result).toEqual({ items: exports });
      expect(apiExportService.listApiExports).toHaveBeenCalledWith(ORG);
    });
  });

  describe('enableApiExport', () => {
    it('calls service and returns no content', async () => {
      (apiExportService.enableApiExport as jest.Mock).mockResolvedValue(undefined);
      await expect(controller.enableApiExport(ORG, 'alpha')).resolves.toBeUndefined();
      expect(apiExportService.enableApiExport).toHaveBeenCalledWith(ORG, 'alpha');
    });

    it('throws NotFoundException on service error', async () => {
      (apiExportService.enableApiExport as jest.Mock).mockRejectedValue(new Error('conflict'));
      await expect(controller.enableApiExport(ORG, 'alpha')).rejects.toThrow(NotFoundException);
    });
  });

  describe('disableApiExport', () => {
    it('calls service and returns no content', async () => {
      (apiExportService.disableApiExport as jest.Mock).mockResolvedValue(undefined);
      await expect(controller.disableApiExport(ORG, 'alpha')).resolves.toBeUndefined();
      expect(apiExportService.disableApiExport).toHaveBeenCalledWith(ORG, 'alpha');
    });

    it('throws NotFoundException on service error', async () => {
      (apiExportService.disableApiExport as jest.Mock).mockRejectedValue(new Error('not found'));
      await expect(controller.disableApiExport(ORG, 'alpha')).rejects.toThrow(NotFoundException);
    });
  });
});
