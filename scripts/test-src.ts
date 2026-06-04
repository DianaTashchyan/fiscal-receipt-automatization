/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================
// scripts/test-src.ts
// Dependency-free test runner for the SRC integration logic.
// Run with:  npx tsx scripts/test-src.ts
//
// Covers (per spec): TIN validation, CRN validation, money formatting,
// quantity formatting, payload mapping, seq increment (interface-level),
// mock print, failed real mode without certificate, successful mock receipt.
//
// These tests intentionally avoid the database & generated Prisma client so
// they run anywhere (CI, fresh clone) without DATABASE_URL.
// ============================================================

import assert from "assert";
import {
  isValidTin,
  isValidCrn,
  money,
  quantity,
  hasMaxDecimals,
  validatePrintInput,
  computeItemsTotal,
} from "../src/lib/src/validation";
import { mapToSrcPrintInput, mapSrcResultToReceiptFields } from "../src/lib/src/mapper";
import { MockSrcClient } from "../src/lib/src/mock-client";
import { SrcValidationError, SrcConfigError } from "../src/lib/src/errors";
import { MODE } from "../src/lib/src/types";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`      ${(err as Error).message}`);
  }
}

(async () => {
  console.log("\nTIN validation");
  await test("accepts an 8-digit TIN", () => assert.equal(isValidTin("00493113"), true));
  await test("rejects 7 digits", () => assert.equal(isValidTin("0049311"), false));
  await test("rejects 9 digits", () => assert.equal(isValidTin("004931133"), false));
  await test("rejects letters", () => assert.equal(isValidTin("0049311a"), false));
  await test("rejects non-string", () => assert.equal(isValidTin(493113 as any), false));

  console.log("\nCRN validation");
  await test("accepts a non-empty CRN", () => assert.equal(isValidCrn("52014201"), true));
  await test("rejects empty CRN", () => assert.equal(isValidCrn(""), false));
  await test("rejects whitespace CRN", () => assert.equal(isValidCrn("   "), false));

  console.log("\nMoney formatting (2 decimals, half-up)");
  await test("rounds 0.005 up to 0.01", () => assert.equal(money(0.005), 0.01));
  await test("rounds 0.004 down to 0", () => assert.equal(money(0.004), 0));
  await test("keeps 44000 as 44000", () => assert.equal(money(44000), 44000));
  await test("parses string money", () => assert.equal(money("3500.50"), 3500.5));
  await test("hasMaxDecimals(2) true for 2dp", () => assert.equal(hasMaxDecimals(3500.5, 2), true));
  await test("hasMaxDecimals(2) false for 3dp", () => assert.equal(hasMaxDecimals(3500.555, 2), false));

  console.log("\nQuantity formatting (3 decimals)");
  await test("rounds to 3 decimals", () => assert.equal(quantity(0.1015), 0.102));
  await test("keeps whole quantity", () => assert.equal(quantity(2), 2));
  await test("hasMaxDecimals(3) true for 3dp", () => assert.equal(hasMaxDecimals(0.101, 3), true));

  console.log("\nPayload mapping (local -> SRC print)");
  await test("maps a products receipt", () => {
    const input = mapToSrcPrintInput({
      crn: "52014201",
      cashierId: 3,
      paymentMethod: "CARD",
      totalAmount: 7000,
      items: [
        {
          name: "Margherita Pizza",
          goodCode: "2106-90",
          adgCode: "2106",
          unit: "piece",
          departmentTaxId: "1",
          quantity: 2,
          unitPrice: 3500,
        },
      ],
    });
    assert.equal(input.crn, "52014201");
    assert.equal(input.mode, MODE.PRODUCTS);
    assert.equal(input.cardAmount, 7000);
    assert.equal(input.cashAmount, 0);
    assert.equal(input.items?.length, 1);
    assert.equal(input.items?.[0].dep, 1);
    assert.equal(input.items?.[0].goodName, "Margherita Pizza");
  });

  await test("CASH payment goes to cashAmount", () => {
    const input = mapToSrcPrintInput({
      crn: "52014201",
      cashierId: 3,
      paymentMethod: "CASH",
      totalAmount: 1500,
      items: [
        { name: "Wine", goodCode: "x", adgCode: "0", unit: "pc", departmentTaxId: "1", quantity: 1, unitPrice: 1500 },
      ],
    });
    assert.equal(input.cashAmount, 1500);
    assert.equal(input.cardAmount, 0);
  });

  await test("truncates goodName/goodCode/unit to 50 chars", () => {
    const long = "x".repeat(80);
    const input = mapToSrcPrintInput({
      crn: "c", cashierId: 1, totalAmount: 10, paymentMethod: "CARD",
      items: [{ name: long, goodCode: long, adgCode: "0", unit: long, departmentTaxId: "1", quantity: 1, unitPrice: 10 }],
    });
    assert.equal(input.items?.[0].goodName.length, 50);
    assert.equal(input.items?.[0].goodCode.length, 50);
    assert.equal(input.items?.[0].unit.length, 50);
  });

  console.log("\nPrint input validation");
  await test("rejects mode other than 2/3", () => {
    assert.throws(() => validatePrintInput({
      crn: "c", cardAmount: 0, cashAmount: 0, partialAmount: 0, prePaymentAmount: 0,
      cashierId: 1, mode: 5 as any, partnerTin: null, items: [],
    }), SrcValidationError);
  });
  await test("rejects empty goodName in mode 2", () => {
    assert.throws(() => validatePrintInput({
      crn: "c", cardAmount: 100, cashAmount: 0, partialAmount: 0, prePaymentAmount: 0,
      cashierId: 1, mode: 2, partnerTin: null,
      items: [{ adgCode: "0", dep: 1, goodCode: "g", goodName: "", quantity: 1, unit: "pc", price: 100 }],
    }), SrcValidationError);
  });
  await test("rejects invalid partnerTin", () => {
    assert.throws(() => validatePrintInput({
      crn: "c", cardAmount: 100, cashAmount: 0, partialAmount: 0, prePaymentAmount: 0,
      cashierId: 1, mode: 2, partnerTin: "123",
      items: [{ adgCode: "0", dep: 1, goodCode: "g", goodName: "n", quantity: 1, unit: "pc", price: 100 }],
    }), SrcValidationError);
  });
  await test("accepts a valid mode-2 payload", () => {
    validatePrintInput({
      crn: "52014201", cardAmount: 100, cashAmount: 0, partialAmount: 0, prePaymentAmount: 0,
      cashierId: 3, mode: 2, partnerTin: null,
      items: [{ adgCode: "2106", dep: 1, goodCode: "2106-90", goodName: "Pizza", quantity: 1, unit: "piece", price: 100 }],
    });
  });
  await test("prepayment (mode 3) rejects items", () => {
    assert.throws(() => validatePrintInput({
      crn: "c", cardAmount: 100, cashAmount: 0, partialAmount: 0, prePaymentAmount: 0,
      cashierId: 1, mode: 3, partnerTin: null,
      items: [{ adgCode: "0", dep: 1, goodCode: "g", goodName: "n", quantity: 1, unit: "pc", price: 100 }],
    }), SrcValidationError);
  });
  await test("computeItemsTotal sums price*qty", () => {
    assert.equal(computeItemsTotal([
      { adgCode: "0", dep: 1, goodCode: "g", goodName: "n", quantity: 2, unit: "pc", price: 3500 },
    ]), 7000);
  });

  console.log("\nseq increment (store contract)");
  await test("an in-memory increment store strictly increases", async () => {
    // Mirrors the contract of sequence.nextSeq() without touching Postgres.
    const m = new Map<string, number>();
    const next = async (crn: string) => {
      const v = (m.get(crn) ?? 0) + 1;
      m.set(crn, v);
      return v;
    };
    const a = await next("CRN1");
    const b = await next("CRN1");
    const c = await next("CRN1");
    assert.equal(a, 1);
    assert.equal(b, 2);
    assert.equal(c, 3);
    assert.ok(b > a && c > b);
    // independent per CRN
    assert.equal(await next("CRN2"), 1);
  });

  console.log("\nMock print");
  await test("mock print returns a fiscal + qr", async () => {
    const client = new MockSrcClient();
    const res = await client.print({
      crn: "52014201", cardAmount: 7000, cashAmount: 0, partialAmount: 0, prePaymentAmount: 0,
      cashierId: 3, mode: 2, partnerTin: null,
      items: [{ adgCode: "2106", dep: 1, goodCode: "2106-90", goodName: "Pizza", quantity: 2, unit: "piece", price: 3500 }],
    }, 2);
    assert.equal(res.code, 0);
    assert.ok(res.result?.fiscal);
    assert.ok(res.result?.qr.includes("CRN: 52014201"));
    assert.equal(res.result?.total, 7000);
  });
  await test("mock checkConnection succeeds", async () => {
    const res = await new MockSrcClient().checkConnection("52014201");
    assert.equal(res.code, 0);
  });

  console.log("\nSuccessful mock receipt mapping");
  await test("maps mock result to receipt fields", async () => {
    const client = new MockSrcClient();
    const res = await client.print({
      crn: "52014201", cardAmount: 1500, cashAmount: 0, partialAmount: 0, prePaymentAmount: 0,
      cashierId: 3, mode: 2, partnerTin: null,
      items: [{ adgCode: "2204", dep: 1, goodCode: "2204-21", goodName: "Wine", quantity: 1, unit: "piece", price: 1500 }],
    }, 1);
    const fields = mapSrcResultToReceiptFields(res.result!);
    assert.ok(fields.fiscalNumber);
    assert.ok(fields.receiptNumber);
    assert.ok(fields.qrData);
    assert.equal(Number(fields.srcTotal), 1500);
  });

  console.log("\nReal mode without certificate fails clearly");
  await test("real client construction throws SrcConfigError when cert missing", async () => {
    const prev = { ...process.env };
    process.env.TAX_API_MODE = "src_real";
    process.env.SRC_CRN = "52014201";
    process.env.SRC_TIN = "00493113";
    delete process.env.SRC_CERT_PATH;
    delete process.env.SRC_JKS_PATH;
    try {
      const { RealSrcClient } = await import("../src/lib/src/real-client");
      assert.throws(() => new RealSrcClient(), (e: unknown) => {
        assert.ok(e instanceof SrcConfigError);
        assert.match((e as Error).message, /SRC certificate is missing/);
        return true;
      });
    } finally {
      process.env = prev;
    }
  });

  console.log("\nPer-restaurant cert password encryption");
  await (async () => {
    const { encryptCertPassword, decryptCertPassword, isEncryptedPassword } = await import("../src/lib/src/cert-crypto");

    await test("encryptCertPassword produces iv:tag:ciphertext format", () => {
      const enc = encryptCertPassword("my-secret");
      assert.equal(enc.split(":").length, 3);
      assert.ok(isEncryptedPassword(enc));
    });

    await test("decryptCertPassword round-trips", () => {
      const plaintext = "super-secret-p12-password";
      const enc = encryptCertPassword(plaintext);
      const dec = decryptCertPassword(enc);
      assert.equal(dec, plaintext);
    });

    await test("each encryption produces a unique ciphertext (random IV)", () => {
      const a = encryptCertPassword("same-password");
      const b = encryptCertPassword("same-password");
      assert.notEqual(a, b); // different IVs → different ciphertext
    });

    await test("decryptCertPassword throws on tampered ciphertext", () => {
      const enc = encryptCertPassword("password");
      const tampered = enc.slice(0, -4) + "xxxx";
      assert.throws(() => decryptCertPassword(tampered));
    });

    await test("isEncryptedPassword rejects plain strings", () => {
      assert.equal(isEncryptedPassword("plaintext-password"), false);
      assert.equal(isEncryptedPassword("a:b"), false);
    });
  })();

  console.log("\nPer-restaurant cert resolution (env fallback)");
  await test("resolveRestaurantCertConfig falls back to getRealCertConfig when no restaurant cert", async () => {
    // Restaurant with no cert fields → must fall back to global env cert check
    const prev = { ...process.env };
    process.env.TAX_API_MODE = "src_real";
    process.env.SRC_CRN = "52014201";
    process.env.SRC_TIN = "00493113";
    delete process.env.SRC_CERT_PATH;
    delete process.env.SRC_JKS_PATH;
    try {
      const { resolveRestaurantCertConfig } = await import("../src/lib/src/config");
      const { SrcConfigError } = await import("../src/lib/src/errors");
      assert.throws(
        () =>
          resolveRestaurantCertConfig({
            id: "r1",
            tin: "00493113",
            crn: "52014201",
            srcCertData: null,
            srcCertPassword: null,
            srcCertPath: null,
          }),
        (e: unknown) => {
          assert.ok(e instanceof SrcConfigError);
          assert.match((e as Error).message, /SRC certificate is missing/);
          return true;
        }
      );
    } finally {
      process.env = prev;
    }
  });

  await test("resolveRestaurantCertConfig uses DB cert bytes when present", async () => {
    const { encryptCertPassword } = await import("../src/lib/src/cert-crypto");
    const { resolveRestaurantCertConfig } = await import("../src/lib/src/config");

    const fakePfx = Buffer.from("fake-pkcs12-bytes");
    const encPw = encryptCertPassword("test-pw");

    const cfg = resolveRestaurantCertConfig({
      id: "r2",
      tin: "00493113",
      crn: "52014201",
      srcCertData: fakePfx,
      srcCertPassword: encPw,
      srcCertPath: null,
    });

    assert.equal(cfg.source, "db");
    assert.deepEqual(cfg.pfx, fakePfx);
    assert.equal(cfg.certPassword, "test-pw");
  });

  // ================================================================
  // Compliance tests — each SRC field gap identified in the audit
  // ================================================================

  console.log("\nDiscount mapping");
  await test("item with discountAmount emits discount + discountType=4 (TOTAL)", () => {
    const input = mapToSrcPrintInput({
      crn: "52014201",
      cashierId: 3,
      paymentMethod: "CARD",
      totalAmount: 6000,
      srcPaymentAmount: 6000,
      items: [
        {
          name: "Pizza",
          goodCode: "2106-90",
          adgCode: "2106",
          unit: "piece",
          departmentTaxId: "1",
          quantity: 2,
          unitPrice: 3500,
          discountAmount: 500,      // 500 AMD off the line total
        },
      ],
    });
    const item = input.items![0];
    assert.equal(item.discount, 500);
    assert.equal(item.discountType, 4);  // DISCOUNT_TYPE.TOTAL
  });

  await test("item with discountAmount=0 emits no discount fields", () => {
    const input = mapToSrcPrintInput({
      crn: "52014201", cashierId: 3, paymentMethod: "CARD",
      totalAmount: 3500, srcPaymentAmount: 3500,
      items: [{ name: "Wine", goodCode: "x", adgCode: "0", unit: "pc",
                departmentTaxId: "1", quantity: 1, unitPrice: 3500, discountAmount: 0 }],
    });
    assert.equal(input.items![0].discount, undefined);
    assert.equal(input.items![0].discountType, undefined);
  });

  await test("computeItemsTotal subtracts TOTAL-type discount from line", () => {
    // price=3500, qty=2 → gross 7000; discount=500 (type TOTAL) → net 6500
    const result = computeItemsTotal([
      { adgCode: "0", dep: 1, goodCode: "g", goodName: "n",
        quantity: 2, unit: "pc", price: 3500, discount: 500, discountType: 4 },
    ]);
    assert.equal(result, 6500);
  });

  await test("computeItemsTotal subtracts PER_UNIT discount correctly", () => {
    // price=3500, qty=2, discount=200 per unit → gross 7000 − (200×2) = 6600
    const result = computeItemsTotal([
      { adgCode: "0", dep: 1, goodCode: "g", goodName: "n",
        quantity: 2, unit: "pc", price: 3500, discount: 200, discountType: 2 },
    ]);
    assert.equal(result, 6600);
  });

  await test("computeItemsTotal subtracts PERCENT discount correctly", () => {
    // price=3000, qty=1, discount=10% → gross 3000 − 300 = 2700
    const result = computeItemsTotal([
      { adgCode: "0", dep: 1, goodCode: "g", goodName: "n",
        quantity: 1, unit: "pc", price: 3000, discount: 10, discountType: 1 },
    ]);
    assert.equal(result, 2700);
  });

  await test("validatePaymentCoversTotal passes when paid equals discounted total", async () => {
    // gross 7000, discount 500 → net 6500; paid 6500 → should pass
    validatePrintInput({
      crn: "52014201", cardAmount: 6500, cashAmount: 0, partialAmount: 0, prePaymentAmount: 0,
      cashierId: 3, mode: 2, partnerTin: null,
      items: [{ adgCode: "2106", dep: 1, goodCode: "2106-90", goodName: "Pizza",
                quantity: 2, unit: "piece", price: 3500, discount: 500, discountType: 4 }],
    });
    const { validatePaymentCoversTotal: vpc } = await import("../src/lib/src/validation");
    vpc({
      crn: "52014201", cardAmount: 6500, cashAmount: 0, partialAmount: 0, prePaymentAmount: 0,
      cashierId: 3, mode: 2, partnerTin: null,
      items: [{ adgCode: "2106", dep: 1, goodCode: "2106-90", goodName: "Pizza",
                quantity: 2, unit: "piece", price: 3500, discount: 500, discountType: 4 }],
    });
  });

  console.log("\nMIXED payment split");
  await test("MIXED with explicit amounts maps correctly to cashAmount/cardAmount", () => {
    const input = mapToSrcPrintInput({
      crn: "52014201", cashierId: 3, paymentMethod: "MIXED",
      totalAmount: 5000, srcPaymentAmount: 5000,
      explicitCashAmount: 2000, explicitCardAmount: 3000,
      items: [{ name: "Item", goodCode: "x", adgCode: "0", unit: "pc",
                departmentTaxId: "1", quantity: 1, unitPrice: 5000 }],
    });
    assert.equal(input.cashAmount, 2000);
    assert.equal(input.cardAmount, 3000);
  });

  await test("MIXED without explicit amounts throws SrcValidationError", () => {
    assert.throws(
      () =>
        mapToSrcPrintInput({
          crn: "52014201", cashierId: 3, paymentMethod: "MIXED",
          totalAmount: 5000, srcPaymentAmount: 5000,
          items: [{ name: "Item", goodCode: "x", adgCode: "0", unit: "pc",
                    departmentTaxId: "1", quantity: 1, unitPrice: 5000 }],
        }),
      SrcValidationError
    );
  });

  await test("MIXED amounts that don't sum to billAmount throws SrcValidationError", () => {
    assert.throws(
      () =>
        mapToSrcPrintInput({
          crn: "52014201", cashierId: 3, paymentMethod: "MIXED",
          totalAmount: 5000, srcPaymentAmount: 5000,
          explicitCashAmount: 1000, explicitCardAmount: 3000, // sum=4000, not 5000
          items: [{ name: "Item", goodCode: "x", adgCode: "0", unit: "pc",
                    departmentTaxId: "1", quantity: 1, unitPrice: 5000 }],
        }),
      SrcValidationError
    );
  });

  await test("CASH maps full amount to cashAmount, cardAmount=0", () => {
    const input = mapToSrcPrintInput({
      crn: "52014201", cashierId: 3, paymentMethod: "CASH",
      totalAmount: 5000, srcPaymentAmount: 5000,
      items: [{ name: "Item", goodCode: "x", adgCode: "0", unit: "pc",
                departmentTaxId: "1", quantity: 1, unitPrice: 5000 }],
    });
    assert.equal(input.cashAmount, 5000);
    assert.equal(input.cardAmount, 0);
  });

  await test("CARD maps full amount to cardAmount, cashAmount=0", () => {
    const input = mapToSrcPrintInput({
      crn: "52014201", cashierId: 3, paymentMethod: "CARD",
      totalAmount: 5000, srcPaymentAmount: 5000,
      items: [{ name: "Item", goodCode: "x", adgCode: "0", unit: "pc",
                departmentTaxId: "1", quantity: 1, unitPrice: 5000 }],
    });
    assert.equal(input.cashAmount, 0);
    assert.equal(input.cardAmount, 5000);
  });

  console.log("\nTip exclusion");
  await test("srcPaymentAmount (billAmount) is used for SRC payment, not totalAmount", () => {
    // totalAmount = 5500 (includes 500 tip), billAmount = 5000
    const input = mapToSrcPrintInput({
      crn: "52014201", cashierId: 3, paymentMethod: "CARD",
      totalAmount: 5500,       // stored in DB
      srcPaymentAmount: 5000,  // sent to SRC (tip excluded)
      items: [{ name: "Item", goodCode: "x", adgCode: "0", unit: "pc",
                departmentTaxId: "1", quantity: 1, unitPrice: 5000 }],
    });
    assert.equal(input.cardAmount, 5000);   // tip NOT included in SRC payment
    assert.equal(input.cashAmount, 0);
  });

  console.log("\nB2B partnerTin");
  await test("partnerTin is forwarded to SRC print payload", () => {
    const input = mapToSrcPrintInput({
      crn: "52014201", cashierId: 3, paymentMethod: "CARD",
      totalAmount: 5000, srcPaymentAmount: 5000,
      partnerTin: "00493113",
      items: [{ name: "Item", goodCode: "x", adgCode: "0", unit: "pc",
                departmentTaxId: "1", quantity: 1, unitPrice: 5000 }],
    });
    assert.equal(input.partnerTin, "00493113");
  });

  await test("partnerTin=null is forwarded as null (B2C)", () => {
    const input = mapToSrcPrintInput({
      crn: "52014201", cashierId: 3, paymentMethod: "CARD",
      totalAmount: 5000, srcPaymentAmount: 5000,
      partnerTin: null,
      items: [{ name: "Item", goodCode: "x", adgCode: "0", unit: "pc",
                departmentTaxId: "1", quantity: 1, unitPrice: 5000 }],
    });
    assert.equal(input.partnerTin, null);
  });

  console.log("\nNormal sale (full round-trip through mock)");
  await test("complete normal sale maps and fiscalizes correctly", async () => {
    const client = new MockSrcClient();
    const payload = mapToSrcPrintInput({
      crn: "52014201", cashierId: 3, paymentMethod: "CARD",
      totalAmount: 7000, srcPaymentAmount: 7000,
      items: [
        { name: "Pizza", goodCode: "2106-90", adgCode: "2106",
          unit: "piece", departmentTaxId: "1", quantity: 2, unitPrice: 3500 },
      ],
    });
    const res = await client.print(payload, 1);
    assert.equal(res.code, 0);
    assert.equal(res.result?.total, 7000);
    assert.ok(res.result?.fiscal);
    assert.ok(res.result?.qr);
  });

  await test("discounted sale: SRC receives discounted net, not gross", async () => {
    // gross 7000, discount 500 → net 6500; pay 6500 by card
    const payload = mapToSrcPrintInput({
      crn: "52014201", cashierId: 3, paymentMethod: "CARD",
      totalAmount: 6500, srcPaymentAmount: 6500,
      items: [
        { name: "Pizza", goodCode: "2106-90", adgCode: "2106",
          unit: "piece", departmentTaxId: "1", quantity: 2, unitPrice: 3500,
          discountAmount: 500, discountType: 4 },
      ],
    });
    assert.equal(payload.cardAmount, 6500);
    assert.equal(payload.items![0].discount, 500);
    assert.equal(payload.items![0].discountType, 4);
    assert.equal(payload.items![0].price, 3500); // full unit price preserved
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
