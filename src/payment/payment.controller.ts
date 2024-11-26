import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  Req,
  Header,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { Auth, HttpContext } from 'src/auth/decorators';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { IHttpContext } from 'src/auth/models';

@Controller('payments')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly configService: ConfigService,
  ) {}

  @Post('applications')
  async createApplication(@Body() data: any) {
    // Implement application creation logic
  }

  @Get(':applicationId/products')
  async getProducts(@Param('applicationId') applicationId: number) {
    return this.paymentService.getProducts(+applicationId);
  }

  @Post(':applicationId/products')
  async createProduct(
    @Param('applicationId') applicationId: number,
    @Body() data: any,
  ) {
    return this.paymentService.createProduct(+applicationId, data);
  }

  @Get(':applicationId/plans')
  async getPlans(@Param('applicationId') applicationId: number) {
    return this.paymentService.getPlans(+applicationId);
  }

  @Post(':applicationId/plans')
  async createPlan(
    @Param('applicationId') applicationId: number,
    @Body() data: any,
  ) {
    return this.paymentService.createPlan(+applicationId, data);
  }

  @Post('pay')
  @Auth()
  async pay(@HttpContext() context: IHttpContext, @Body() data: any) {
    const userId = context.user.id;
    const { productId, planId } = data;
    return this.paymentService.handlePayment(userId, productId, planId);
  }

  @Post('webhook')
  async handleWebhook(@Req() req: Request) {
    const rawBody = Buffer.from(JSON.stringify(req.body));
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;

    try {
      event = this.paymentService.constructWebhookEvent(
        rawBody,
        req.headers.get('stripe-signature'),
        webhookSecret,
      );
    } catch (err) {
      console.error(`Webhook Error: ${err.message}`);
      // Return a 400 error to Stripe
      return { error: 'Webhook Error' };
    }

    await this.paymentService.handleWebhook(event);

    return { received: true };
  }

  //   @Auth()
  //   @Get('user/products')
  //   async getUserProducts(@Request() req) {
  //     const userId = req.user.id;
  //     return this.paymentService.getUserPurchases(userId);
  //   }

  //   @Auth()
  //   @Get('user/plans')
  //   async getUserPlans(@Request() req) {
  //     const userId = req.user.id;
  //     return this.paymentService.getUserSubscriptions(userId);
  //   }
}
