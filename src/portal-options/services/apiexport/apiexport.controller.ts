import {
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

@Controller('rest/admin')
@UseGuards(PlatformAdminGuard)
export class ApiExportController {
  constructor(private readonly apiExportService: ApiExportService) {}

  @Get('apiexports')
  async listApiExports(
    @Query('organization') organization: string,
  ): Promise<ApiExportListResponse> {
    const items = await this.apiExportService.listApiExports(organization);
    return { items };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('apiexports/:name/enable')
  async enableApiExport(
    @Query('organization') organization: string,
    @Param('name') name: string,
  ): Promise<void> {
    try {
      await this.apiExportService.enableApiExport(organization, name);
    } catch {
      throw new NotFoundException(`APIExport "${name}" not found or already enabled`);
    }
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('apiexports/:name/enable')
  async disableApiExport(
    @Query('organization') organization: string,
    @Param('name') name: string,
  ): Promise<void> {
    try {
      await this.apiExportService.disableApiExport(organization, name);
    } catch {
      throw new NotFoundException(`APIExport "${name}" not found or not enabled`);
    }
  }
}
