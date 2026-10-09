import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type {
  ApiExportEntry,
  CreatePolicyRequest,
  OrgEntry,
  PolicyEntry,
  UpdatePolicyRequest,
} from './platform-admin.types.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';
import { PlatformAdminService } from './platform-admin.service.js';

@Controller('api/v1/admin')
@UseGuards(PlatformAdminGuard)
export class PlatformAdminController {
  constructor(private readonly service: PlatformAdminService) {}

  @Get('apiexports')
  listApiExports(): Promise<ApiExportEntry[]> {
    return this.service.listApiExports();
  }

  @Get('orgs')
  listOrgs(): Promise<OrgEntry[]> {
    return this.service.listOrgs();
  }

  @Get('apiexport-policies')
  listPolicies(): Promise<PolicyEntry[]> {
    return this.service.listPolicies();
  }

  @Post('apiexport-policies')
  @HttpCode(201)
  createPolicy(@Body() dto: CreatePolicyRequest): Promise<void> {
    return this.service.createPolicy(dto);
  }

  @Put('apiexport-policies/:name')
  @HttpCode(200)
  updatePolicy(
    @Param('name') name: string,
    @Body() dto: UpdatePolicyRequest,
  ): Promise<void> {
    return this.service.updatePolicy(name, dto);
  }

  @Delete('apiexport-policies/:name')
  @HttpCode(204)
  deletePolicy(@Param('name') name: string): Promise<void> {
    return this.service.deletePolicy(name);
  }
}
