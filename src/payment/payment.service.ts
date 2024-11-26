// payment.service.ts

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';
import { IHttpContext } from 'src/auth/models';

@Injectable()
export class PaymentService {
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.stripe = new Stripe(this.configService.get('STRIPE_SECRET_KEY'), {
      apiVersion: '2024-11-20.acacia',
    });
  }

  async createProduct(applicationId: number, data: any) {
    // Create product in Stripe
    const stripeProduct = await this.stripe.products.create({
      name: data.name,
      description: data.description,
    });

    // Create price in Stripe
    const stripePrice = await this.stripe.prices.create({
      product: stripeProduct.id,
      unit_amount: Math.round(data.price * 100), // amount in cents
      currency: 'eur', // or any other currency
      recurring: data.interval
        ? {
            interval: 'day',
            interval_count: data.interval,
          }
        : undefined,
    });

    // Save to database
    return this.prisma.product.create({
      data: {
        name: data.name,
        description: data.description,
        price: data.price,
        applicationId,
        externalProductId: stripeProduct.id,
        externalPriceId: stripePrice.id,
      },
    });
  }

  async getProducts(applicationId: number) {
    return this.prisma.product.findMany({
      where: { applicationId },
    });
  }

  async createPlan(applicationId: number, data: any) {
    // Create product in Stripe
    const stripeProduct = await this.stripe.products.create({
      name: data.name,
      description: data.description,
    });

    // Create price in Stripe
    const stripePrice = await this.stripe.prices.create({
      product: stripeProduct.id,
      unit_amount: Math.round(data.price * 100),
      currency: 'eur',
      recurring: {
        interval: 'day',
        interval_count: data.interval,
      },
    });

    // Save to database
    return this.prisma.plan.create({
      data: {
        name: data.name,
        description: data.description,
        price: data.price,
        interval: data.interval,
        applicationId,
        externalProductId: stripeProduct.id,
        externalPriceId: stripePrice.id,
      },
    });
  }

  async getPlans(applicationId: number) {
    return this.prisma.plan.findMany({
      where: { applicationId },
    });
  }

  async handlePayment(
    context: IHttpContext,
    productId?: number,
    planId?: number,
  ) {
    let session: Stripe.Checkout.Session;

    if (productId) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
      });

      session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: context.user.email,
        line_items: [
          {
            price: product.externalPriceId,
            quantity: 1,
          },
        ],
        success_url:
          'https://payments.erzen.xyz/success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://payments.erzen.xyz/cancel',
        metadata: {
          userId: context.user.id.toString(),
          productId: productId.toString(),
        },
      });
    } else if (planId) {
      const plan = await this.prisma.plan.findUnique({
        where: { id: planId },
      });

      session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        customer_email: context.user.email,
        line_items: [
          {
            price: plan.externalPriceId,
            quantity: 1,
          },
        ],
        success_url:
          'https://payments.erzen.xyz/success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://payments.erzen.xyz/cancel',
        metadata: {
          userId: context.user.id.toString(),
          planId: planId.toString(),
        },
      });
    }

    return { sessionId: session.id };
  }

  async handleWebhook(event: Stripe.Event) {
    const eventData = event.data.object as any;

    switch (event.type) {
      case 'checkout.session.completed':
        const session = eventData as Stripe.Checkout.Session;
        await this.fulfillOrder(session);
        break;

      case 'customer.subscription.updated':
        const updatedSubscription = eventData as Stripe.Subscription;
        await this.updateSubscriptionStatus(updatedSubscription);
        break;

      case 'customer.subscription.deleted':
        const deletedSubscription = eventData as Stripe.Subscription;
        await this.cancelSubscription(deletedSubscription);
        break;

      case 'invoice.payment_failed':
        const failedInvoice = eventData as Stripe.Invoice;
        await this.handleFailedPayment(failedInvoice);
        break;

      // Handle other relevant events
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  }

  private async fulfillOrder(session: Stripe.Checkout.Session) {
    const userId = parseInt(session.metadata.userId);

    if (session.mode === 'payment') {
      const productId = parseInt(session.metadata.productId);
      await this.prisma.purchase.create({
        data: {
          userId,
          productId,
          purchasedAt: new Date(),
        },
      });
    } else if (session.mode === 'subscription') {
      const planId = parseInt(session.metadata.planId);
      const subscription = session.subscription as string;
      await this.prisma.subscription.create({
        data: {
          userId,
          planId,
          externalSubscriptionId: subscription,
          startDate: new Date(),
          active: true,
        },
      });
    }
  }

  private async updateSubscriptionStatus(subscription: Stripe.Subscription) {
    const stripeSubscriptionId = subscription.id;
    const { status } = subscription;

    await this.prisma.subscription.updateMany({
      where: { externalSubscriptionId: stripeSubscriptionId },
      data: { status, active: status === 'active' },
    });
  }

  private async cancelSubscription(subscription: Stripe.Subscription) {
    const stripeSubscriptionId = subscription.id;

    await this.prisma.subscription.updateMany({
      where: { externalSubscriptionId: stripeSubscriptionId },
      data: { active: false, status: 'canceled' },
    });
  }

  private async handleFailedPayment(invoice: Stripe.Invoice) {
    const subscriptionId = invoice.subscription as string;

    // Mark subscription as unpaid
    await this.prisma.subscription.updateMany({
      where: { externalSubscriptionId: subscriptionId },
      data: { active: false, status: invoice.status },
    });
  }

  public constructWebhookEvent(
    payload: Buffer,
    signature: string,
    secret: string,
  ): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }
}
