import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Headers } from '@nestjs/common';
import { RepairService } from './repair.service';
import { CreateRepairTicketDto } from './dto/create-repair-ticket.dto';
import { UpdateRepairStatusDto } from './dto/update-repair-status.dto';
import { AuthService } from '../auth/auth.service';
import { sessionTokenOf } from '../auth/session-header';

@Controller('repair')
export class RepairController {
  constructor(
    private readonly repairService: RepairService,
    private readonly authService: AuthService,
  ) {}

  private operatorId(headers: Record<string, string | string[] | undefined>) {
    return this.authService.userForToken(sessionTokenOf(headers)).then((u) => u?.id);
  }

  @Post()
  async create(
    @Body() dto: CreateRepairTicketDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.repairService.createTicket(dto, await this.operatorId(headers));
  }

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('contactId') contactId?: string,
    @Query('repairType') repairType?: string,
    @Query('search') search?: string,
  ) {
    return this.repairService.findAll({ status, contactId, repairType, search });
  }

  @Get('metrics')
  metrics() {
    return this.repairService.getMetrics();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.repairService.findOne(id);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRepairStatusDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.repairService.updateStatus(id, dto, await this.operatorId(headers));
  }

  @Post(':id/external-cost')
  recordExternalCost(@Param('id') id: string, @Body() dto: { externalCost: string; note?: string }) {
    return this.repairService.recordExternalCost(id, dto);
  }

  @Post(':id/parts')
  addPart(
    @Param('id') id: string,
    @Body() dto: { inventoryItemId: string; quantity: number; unitPrice?: string },
  ) {
    return this.repairService.addPart(id, dto);
  }

  @Delete(':id/parts/:partId')
  removePart(@Param('id') id: string, @Param('partId') partId: string) {
    return this.repairService.removePart(id, partId);
  }

  @Patch(':id/financials')
  updateFinancials(
    @Param('id') id: string,
    @Body() dto: { laborCost?: string; discountAmount?: string },
  ) {
    return this.repairService.updateFinancials(id, dto);
  }

  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.repairService.softDelete(id);
  }
}
