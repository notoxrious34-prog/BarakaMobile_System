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
  ) {
    return this.repairService.findAll({ status, contactId, repairType });
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

  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.repairService.softDelete(id);
  }
}
