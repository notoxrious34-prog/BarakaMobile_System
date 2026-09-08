import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { RepairService } from './repair.service';
import { CreateRepairTicketDto } from './dto/create-repair-ticket.dto';
import { UpdateRepairStatusDto } from './dto/update-repair-status.dto';

@Controller('repair')
export class RepairController {
  constructor(private readonly repairService: RepairService) {}

  @Post()
  create(@Body() dto: CreateRepairTicketDto) {
    return this.repairService.createTicket(dto);
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
  updateStatus(@Param('id') id: string, @Body() dto: UpdateRepairStatusDto) {
    return this.repairService.updateStatus(id, dto);
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
