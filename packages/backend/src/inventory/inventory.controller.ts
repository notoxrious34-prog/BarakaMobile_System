import { Controller, Get, Post, Patch, Delete, Body, Param, Headers } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { AuthService, capabilitiesFor } from '../auth/auth.service';
import { sessionTokenOf } from '../auth/session-header';

export const COST_MASK = 'MASKED';

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly authService: AuthService,
  ) {}

  private async maskCosts<T extends { costPrice?: string }>(
    headers: Record<string, string | string[] | undefined>,
    rows: T[],
  ): Promise<T[]> {
    const user = await this.authService.userForToken(sessionTokenOf(headers));
    // No session (legacy/desktop callers) → full data. Authenticated CASHIER
    // without override → costPrice masked.
    if (!user) return rows;
    if (capabilitiesFor(user).canViewCosts) return rows;
    return rows.map((r) => ({ ...r, costPrice: COST_MASK }));
  }

  @Post('items')
  createItem(@Body() dto: CreateItemDto) {
    return this.inventoryService.createItem(dto);
  }

  @Get('items')
  async findAllItems(@Headers() headers: Record<string, string | string[] | undefined>) {
    const rows = await this.inventoryService.findAllItems();
    return this.maskCosts(headers, rows);
  }

  @Get('items/:id')
  async findOneItem(
    @Param('id') id: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const row = await this.inventoryService.findOneItem(id);
    return (await this.maskCosts(headers, [row]))[0];
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
