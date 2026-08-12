import { Body, Controller, Post, Req, UnauthorizedException } from '@nestjs/common';
import { HeaderParserService } from '@openmfp/portal-server-lib';
import { AuthorizationRequest, Permission } from './models/permissions.model.js';
import { PermissionsProxyService } from './permissions-proxy.service.js';

@Controller('rest/permissions')
export class PermissionsController {
  constructor(
    private readonly permissionsProxyService: PermissionsProxyService,
    private readonly headerParser: HeaderParserService,
  ) {}

  @Post('resource-check')
  async checkResource(
    @Req() request: Request,
    @Body() body: AuthorizationRequest,
  ): Promise<Permission[]> {
    const token = this.headerParser.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    const result = await this.permissionsProxyService.checkResourceInstance({
      ...body,
      token,
    });

    return result ?? [];
  }
}
