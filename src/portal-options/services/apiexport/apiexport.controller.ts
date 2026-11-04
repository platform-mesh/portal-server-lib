import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { PlatformAdminGuard } from '../platform-admin/platform-admin.guard.js';
import { ApiExportService } from './apiexport.service.js';
import { ApiExportListResponse, SetApiExportPolicyRequest } from './models/apiexport.model.js';

@Controller('rest/admin')
@UseGuards(PlatformAdminGuard)
export class ApiExportController {
  constructor(private readonly apiExportService: ApiExportService) {}

  @Get('apiexports')
  async listApiExports(): Promise<ApiExportListResponse> {
    const items = await this.apiExportService.listApiExports();
    return { items };
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Put('apiexports/:name/policy')
  async setApiExportPolicy(
    @Param('name') name: string,
    @Body() body: unknown,
  ): Promise<void> {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Request body must be a JSON object');
    }
    const req = body as SetApiExportPolicyRequest;
    if (typeof req.clusterPath !== 'string') {
      throw new BadRequestException('clusterPath must be a string');
    }
    if (!Array.isArray(req.allowRules)) {
      throw new BadRequestException('allowRules must be an array');
    }
    await this.apiExportService.setApiExportPolicy(name, req);
  }
}
