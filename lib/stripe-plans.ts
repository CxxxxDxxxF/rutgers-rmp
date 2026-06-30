export const CHECKOUT_PLANS = {
  pro: {
    id: 'pro',
    priceEnvVar: 'STRIPE_PRICE_ID',
  },
} as const

export type CheckoutPlanId = keyof typeof CHECKOUT_PLANS
type CheckoutPlanEnv = {
  STRIPE_SECRET_KEY?: string
  STRIPE_PRICE_ID?: string
}

export function parseCheckoutPlan(value: unknown): CheckoutPlanId | null {
  return value === 'pro' ? 'pro' : null
}

export function checkoutPriceIdForPlan(
  plan: CheckoutPlanId,
  env: CheckoutPlanEnv = { STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID }
) {
  const priceId = env[CHECKOUT_PLANS[plan].priceEnvVar]?.trim()
  return priceId && priceId.length > 0 ? priceId : null
}

export function isCheckoutConfigured(
  plan: CheckoutPlanId,
  env: CheckoutPlanEnv = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID,
  }
) {
  return Boolean(env.STRIPE_SECRET_KEY?.trim() && checkoutPriceIdForPlan(plan, env))
}
