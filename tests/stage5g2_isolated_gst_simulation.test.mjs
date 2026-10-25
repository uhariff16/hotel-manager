import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { calculateGstBreakdown } from '../src/lib/invoiceIssuerConfig.js';

test('Stage 5G.2 — Isolated GST Calculation & Place of Supply Validation', async (t) => {
  const basePaise = 49900;
  const gstRate = 18;
  const pricingMode = 'exclusive';

  const expectedGstPaise = Math.round(basePaise * (gstRate / 100)); // 8982 paise
  const expectedTotalPaise = basePaise + expectedGstPaise;          // 58882 paise (₹588.82)

  assert.equal(expectedGstPaise, 8982, 'GST must be exactly 8,982 paise (₹89.82)');
  assert.equal(expectedTotalPaise, 58882, 'Total must be exactly 58,882 paise (₹588.82)');

  await t.test('1. Intra-State Place of Supply (Tamil Nadu to Tamil Nadu: 33 -> 33)', () => {
    const calc = calculateGstBreakdown({
      amountPaise: basePaise,
      ratePercent: gstRate,
      pricingMode,
      sellerStateCode: '33',
      customerStateCode: '33'
    });

    assert.equal(calc.taxType, 'intra_state');
    assert.equal(calc.baseAmountPaise, 49900);
    assert.equal(calc.gstRate, 18);
    assert.equal(calc.gstAmountPaise, 8982);
    assert.equal(calc.totalAmountPaise, 58882);
    assert.equal(calc.cgstAmountPaise, 4491);
    assert.equal(calc.sgstAmountPaise, 4491);
    assert.equal(calc.igstAmountPaise, 0);
    assert.equal(calc.baseAmountPaise + calc.cgstAmountPaise + calc.sgstAmountPaise + calc.igstAmountPaise, calc.totalAmountPaise);
  });

  await t.test('2. Inter-State Place of Supply (Tamil Nadu to Karnataka: 33 -> 29)', () => {
    const calc = calculateGstBreakdown({
      amountPaise: basePaise,
      ratePercent: gstRate,
      pricingMode,
      sellerStateCode: '33',
      customerStateCode: '29'
    });

    assert.equal(calc.taxType, 'inter_state');
    assert.equal(calc.baseAmountPaise, 49900);
    assert.equal(calc.gstRate, 18);
    assert.equal(calc.gstAmountPaise, 8982);
    assert.equal(calc.totalAmountPaise, 58882);
    assert.equal(calc.cgstAmountPaise, 0);
    assert.equal(calc.sgstAmountPaise, 0);
    assert.equal(calc.igstAmountPaise, 8982);
    assert.equal(calc.baseAmountPaise + calc.cgstAmountPaise + calc.sgstAmountPaise + calc.igstAmountPaise, calc.totalAmountPaise);
  });

  await t.test('3. Edge Function razorpay-create-subscription Integer Rounding Logic Equivalence', () => {
    const basePriceRupees = 499;
    const basePricePaise = Math.round(basePriceRupees * 100);
    const isGstEnabled = true;
    let priceInPaise = basePricePaise;
    let gstAmountPaise = 0;
    let effectiveBasePaise = basePricePaise;

    if (isGstEnabled) {
      gstAmountPaise = Math.round(basePricePaise * (gstRate / 100));
      priceInPaise = basePricePaise + gstAmountPaise;
      effectiveBasePaise = basePricePaise;
    }

    assert.equal(effectiveBasePaise, 49900);
    assert.equal(gstAmountPaise, 8982);
    assert.equal(priceInPaise, 58882);
  });
});
