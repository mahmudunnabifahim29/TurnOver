import assert from "node:assert/strict";
import { test } from "node:test";
// Node's direct TypeScript execution needs an explicit extension.
// @ts-expect-error -- intentionally executed by Node, not emitted by tsc.
import { formatBDT, normalizeBDPhone } from "./format.ts";

test("BDT uses lakh grouping and Bengali digits", () => {
  assert.equal(formatBDT(125000), "৳1,25,000");
  assert.equal(formatBDT(125000, "bn"), "৳১,২৫,০০০");
  assert.equal(formatBDT(1250.5), "৳1,250.5");
  for (const invalid of [-1, NaN, Infinity]) assert.throws(() => formatBDT(invalid));
});

test("Bangladeshi mobile numbers normalize without accepting invalid prefixes or lengths", () => {
  for (const input of ["01712-345678", "+880 1712 345678", "8801712345678"]) {
    assert.equal(normalizeBDPhone(input), "+8801712345678");
  }
  for (const input of ["01212345678", "0171234567", "+911712345678", "01712abc678", ""]) {
    assert.equal(normalizeBDPhone(input), null);
  }
});
