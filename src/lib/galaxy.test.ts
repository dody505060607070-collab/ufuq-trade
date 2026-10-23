import { describe, expect, it } from "vitest";
import { buildGalaxy } from "./galaxy";

describe("buildGalaxy", () => {
  it("links a lesson to the rule it produced", () => {
    const g = buildGalaxy(
      [{ id: "l1", symbol: "XAUUSD", side: "buy", profit: 12, outcome: "win", lesson: "x", reason: null, rule: "Avoid news" }],
      [{ id: "r1", rule: "avoid news", hits: 2, symbol: "XAUUSD", is_active: true }],
    );
    const lesson = g.nodes.findIndex((n) => n.id === "l:l1");
    const rule = g.nodes.findIndex((n) => n.id === "r:r1");
    expect(g.edges.some((e) => e.a === lesson && e.b === rule)).toBe(true);
  });
  it("hides inactive rules", () => {
    const g = buildGalaxy([], [{ id: "r1", rule: "a", hits: 1, symbol: null, is_active: false }]);
    expect(g.nodes.some((n) => n.kind === "rule")).toBe(false);
  });
});
