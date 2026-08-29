import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('items')
  createItem(@Body() dto: CreateItemDto) {
    return this.inventoryService.createItem(dto);
  }

  @Get('items')
  findAllItems() {
    return this.inventoryService.findAllItems();
  }

  @Get('items/:id')
  findOneItem(@Param('id') id: string) {
    return this.inventoryService.findOneItem(id);
  }

  @Patch('items/:id')
  updateItem(@Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.inventoryService.updateItem(id, dto);
  }

  @Delete('items/:id')
  deactivateItem(@Param('id') id: string) {
    return this.inventoryService.deactivateItem(id);
  }

  @Post('movements')
  addMovement(@Body() dto: CreateStockMovementDto) {
    return this.inventoryService.addMovement(dto);
  }

  @Get('movements/:itemId')
  findMovementsByItem(@Param('itemId') itemId: string) {
    return this.inventoryService.findMovementsByItem(itemId);
  }
}
