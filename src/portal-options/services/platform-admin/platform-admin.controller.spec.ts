import { Test, TestingModule } from '@nestjs/testing';
import { mock } from 'jest-mock-extended';

jest.mock('@kubernetes/client-node/dist/gen/middleware.js', () => ({
  PromiseMiddlewareWrapper: class {
    constructor(public options: unknown) {}
  },
}));

jest.mock('@kubernetes/client-node', () => ({
  CustomObjectsApi: jest.fn(),
  CoreV1Api: jest.fn(),
  KubeConfig: jest.fn(),
}));

import type {
  ApiExportEntry,
  CreatePolicyRequest,
  OrgEntry,
  PolicyEntry,
} from './platform-admin.types.js';
import { PlatformAdminController } from './platform-admin.controller.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';
import { PlatformAdminService } from './platform-admin.service.js';

const API_EXPORTS: ApiExportEntry[] = [
  { name: 'my-api', clusterPath: 'root:providers:acme' },
];

const ORGS: OrgEntry[] = [{ name: 'org-a' }];

const POLICIES: PolicyEntry[] = [
  {
    name: 'policy-1',
    apiExportRef: { name: 'my-api', clusterPath: 'root:providers:acme' },
    allowPathExpressions: ['root:orgs:*'],
  },
];

describe('PlatformAdminController', () => {
  let controller: PlatformAdminController;
  let service: jest.Mocked<PlatformAdminService>;

  beforeEach(async () => {
    service = mock<PlatformAdminService>();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlatformAdminController],
      providers: [{ provide: PlatformAdminService, useValue: service }],
    })
      .overrideGuard(PlatformAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(PlatformAdminController);
  });

  describe('listApiExports', () => {
    it('delegates to the service and returns the result', async () => {
      service.listApiExports.mockResolvedValue(API_EXPORTS);

      await expect(controller.listApiExports()).resolves.toEqual(API_EXPORTS);
      expect(service.listApiExports).toHaveBeenCalledTimes(1);
    });
  });

  describe('listOrgs', () => {
    it('delegates to the service and returns the result', async () => {
      service.listOrgs.mockResolvedValue(ORGS);

      await expect(controller.listOrgs()).resolves.toEqual(ORGS);
      expect(service.listOrgs).toHaveBeenCalledTimes(1);
    });
  });

  describe('listPolicies', () => {
    it('delegates to the service and returns the result', async () => {
      service.listPolicies.mockResolvedValue(POLICIES);

      await expect(controller.listPolicies()).resolves.toEqual(POLICIES);
      expect(service.listPolicies).toHaveBeenCalledTimes(1);
    });
  });

  describe('createPolicy', () => {
    it('delegates to the service', async () => {
      service.createPolicy.mockResolvedValue(undefined);
      const dto: CreatePolicyRequest = {
        name: 'p',
        apiExportName: 'my-api',
        clusterPath: 'root:providers:acme',
        allowPathExpressions: [],
      };

      await controller.createPolicy(dto);

      expect(service.createPolicy).toHaveBeenCalledWith(dto);
    });
  });

  describe('updatePolicy', () => {
    it('delegates to the service with the name and dto', async () => {
      service.updatePolicy.mockResolvedValue(undefined);

      await controller.updatePolicy('p', { allowPathExpressions: ['root:orgs:*'] });

      expect(service.updatePolicy).toHaveBeenCalledWith('p', {
        allowPathExpressions: ['root:orgs:*'],
      });
    });
  });

  describe('deletePolicy', () => {
    it('delegates to the service with the name', async () => {
      service.deletePolicy.mockResolvedValue(undefined);

      await controller.deletePolicy('p');

      expect(service.deletePolicy).toHaveBeenCalledWith('p');
    });
  });
});
