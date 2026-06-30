import assert from 'node:assert/strict'
import test from 'node:test'

import { checkoutPriceIdForPlan, isCheckoutConfigured, parseCheckoutPlan } from './stripe-plans'

test('parseCheckoutPlan only accepts the supported pro checkout plan', () => {
  assert.equal(parseCheckoutPlan('pro'), 'pro')
  assert.equal(parseCheckoutPlan('club'), null)
  assert.equal(parseCheckoutPlan(undefined), null)
})

test('checkoutPriceIdForPlan resolves the pro price from STRIPE_PRICE_ID', () => {
  assert.equal(checkoutPriceIdForPlan('pro', { STRIPE_PRICE_ID: ' price_student_pro ' }), 'price_student_pro')
  assert.equal(checkoutPriceIdForPlan('pro', { STRIPE_PRICE_ID: '   ' }), null)
  assert.equal(checkoutPriceIdForPlan('pro', {}), null)
})

test('isCheckoutConfigured requires both Stripe secret and the selected plan price', () => {
  assert.equal(isCheckoutConfigured('pro', {
    STRIPE_SECRET_KEY: 'sk_test_configured',
    STRIPE_PRICE_ID: 'price_student_pro',
  }), true)
  assert.equal(isCheckoutConfigured('pro', {
    STRIPE_SECRET_KEY: 'sk_test_configured',
  }), false)
  assert.equal(isCheckoutConfigured('pro', {
    STRIPE_PRICE_ID: 'price_student_pro',
  }), false)
})
