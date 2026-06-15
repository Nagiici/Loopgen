import { describe, expect, test } from "vitest";
import { calculateSubtotal } from "./checkout";

describe("calculateSubtotal", () => {
  test("totals item prices by quantity", () => {
    expect(
      calculateSubtotal([
        { sku: "starter", price: 12, quantity: 2 },
        { sku: "team", price: 20, quantity: 1 }
      ])
    ).toBe(44);
  });
});
