import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
import { ActorRequest, ActorService } from '../auth/actor.service';
import { CreateOrderInput, OrdersService, UpdateFulfillmentInput } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly actorService: ActorService,
  ) {}

  @Get()
  async list(@Query('userId') fallbackUserId: string | undefined, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, fallbackUserId);
    return this.ordersService.list(userId);
  }

  @Get('baker')
  async listForBaker(
    @Query('userId') fallbackUserId: string | undefined,
    @Query('bakerId') bakerId: string | undefined,
    @Req() request: ActorRequest,
  ) {
    const userId = await this.actorService.userIdFromRequest(request, fallbackUserId);
    return this.ordersService.listForBaker({ userId, bakerId });
  }

  @Get(':id')
  async get(@Param('id') id: string, @Query('userId') fallbackUserId: string | undefined, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, fallbackUserId);
    return this.ordersService.get(id, userId);
  }

  @Post()
  async create(@Body() input: CreateOrderInput, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, input.userId);
    return this.ordersService.createFromQuote({ ...input, userId });
  }

  @Patch(':id/fulfillment')
  @UseGuards(AdminAuthGuard)
  updateFulfillment(@Param('id') id: string, @Body() input: UpdateFulfillmentInput) {
    return this.ordersService.updateFulfillment(id, input);
  }

  @Patch(':id/baker-fulfillment')
  async updateBakerFulfillment(@Param('id') id: string, @Body() input: UpdateFulfillmentInput, @Req() request: ActorRequest) {
    const userId = await this.actorService.userIdFromRequest(request, input.userId);
    return this.ordersService.updateBakerFulfillment(id, { ...input, userId });
  }
}
