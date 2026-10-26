import {
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PlatformAdminGuard } from '../platform-admin/platform-admin.guard.js';
import { ApiExportService } from './apiexport.service.js';
import { ApiExportListResponse } from './models/apiexport.model.js';

// Kubernetes name: lowercase alphanumeric and hyphens, start/end with alphanumeric
const K8S_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function validateOrganization(organization: string | undefined): void {
  if (!organization || !K8S_NAME_PATTERN.test(organization)) {
    throw new BadRequestException(
      'organization query parameter is required and must be a valid Kubernetes name',
    );
  }
}

@Controller('rest/admin')
@UseGuards(PlatformAdminGuard)
export class ApiExportController {
  constructor(private readonly apiExportService: ApiExportService) {}

  @Get('apiexports')
  async listApiExports(
    @Query('organization') organization: string,
  ): Promise<ApiExportListResponse> {
    validateOrganization(organization);
    const items = await this.apiExportService.listApiExports(organization);
    return { items };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('apiexports/:name/enable')
  async enableApiExport(
    @Query('organization') organization: string,
    @Param('name') name: string,
  ): Promise<void> {
    validateOrganization(organization);
    try {
      await this.apiExportService.enableApiExport(organization, name);
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404) throw new NotFoundException(`APIExport "${name}" not found`);
      if (status === 409) throw new ConflictException(`APIExport "${name}" is already enabled`);
      throw err;
    }
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('apiexports/:name/enable')
  async disableApiExport(
    @Query('organization') organization: string,
    @Param('name') name: string,
  ): Promise<void> {
    validateOrganization(organization);
    try {
      await this.apiExportService.disableApiExport(organization, name);
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404) throw new NotFoundException(`APIExport "${name}" not found or not enabled`);
      throw err;
    }
  }
}
