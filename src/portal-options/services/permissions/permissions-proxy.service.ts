import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ContentConfiguration } from '@openmfp/portal-server-lib';
import { extractResourceDefinitions } from '../../utils/extract-resource-definitions.util.js';
import { OpenFgaAdapter } from './adapters/openfga/open-fga.adapter.js';
import { AuthorizationRequest, IPermissionsAdapter, Permission } from './models/permissions.model.js';

@Injectable()
export class PermissionsProxyService {
  private readonly logger = new Logger(PermissionsProxyService.name);
  private readonly adapter: IPermissionsAdapter | undefined;

  constructor(private readonly httpService: HttpService) {
    const fgaUrl = process.env['OPENMFP_PORTAL_CONTEXT_OPEN_FGA_API_URL'];
    if (fgaUrl) {
      this.adapter = new OpenFgaAdapter(this.httpService, fgaUrl);
      this.logger.log('Using OpenFGA permissions adapter');
    } else {
      this.logger.warn('No permissions adapter configured — permissions checks are disabled (fail-open)');
    }
  }

  async resolvePermissions(
    token: string,
    organization: string,
    accountPath: string,
    contentConfigurations: ContentConfiguration[],
  ): Promise<Permission[] | undefined> {
    if (!this.adapter) {
      return undefined;
    }

    const resourceDefinitions = extractResourceDefinitions(contentConfigurations);
    if (!resourceDefinitions.length) {
      return undefined;
    }

    const checks = resourceDefinitions
      .filter((rd) => rd.checkActions !== undefined)
      .map((rd) => ({
        resource: rd.entity,
        apiGroup: rd.apiGroup ?? '',
        actions: rd.checkActions as string[] | 'All',
      }));

    const req: AuthorizationRequest = { token, organization, accountPath, checks };

    try {
      const response = await this.adapter.checkPermissions(req);
      return response.permissions;
    } catch (err) {
      this.logger.error('Permissions resolution failed — failing open', err);
      return undefined;
    }
  }
}
