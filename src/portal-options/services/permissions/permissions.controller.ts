import { Body, Controller, Post } from '@nestjs/common';
import { AuthorizationRequest, Permission } from './models/permissions.model.js';
import { PermissionsProxyService } from './permissions-proxy.service.js';

@Controller('rest/permissions')
export class PermissionsController {
  constructor(
    private readonly permissionsProxyService: PermissionsProxyService,
  ) {}

  @Post('resource-check')
  async checkResource(
    @Body() body: AuthorizationRequest,
  ): Promise<Permission[]> {
    const result = await this.permissionsProxyService.checkResourceInstance(
      body,
    );

    return result ?? [];
  }
}
