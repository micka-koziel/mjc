import {describe, it, expect} from "vitest";
import threadReader from "./thread-reader.js";
const {deriveThreadSignals, sortThreadChronological} = threadReader;

const IN = ["INBOX"];
const OUT = ["SENT"];

describe("deriveThreadSignals", () => {
  it("dérive les derniers messages entrant/sortant + ids", () => {
    const msgs = [
      {id: "m1", labels: IN, receivedAt: 1000},
      {id: "m2", labels: OUT, receivedAt: 2000},
      {id: "m3", labels: IN, receivedAt: 3000},
    ];
    const s = deriveThreadSignals(msgs);
    expect(s.lastMessageAtMs).toBe(3000);
    expect(s.lastMessageId).toBe("m3");
    expect(s.lastInboundAtMs).toBe(3000);
    expect(s.lastInboundMessageId).toBe("m3");
    expect(s.lastOutboundAtMs).toBe(2000);
    expect(s.count).toBe(3);
  });

  it("ignore les brouillons Gmail", () => {
    const msgs = [
      {id: "m1", labels: IN, receivedAt: 1000},
      {id: "draft", labels: ["DRAFT"], receivedAt: 9999},
    ];
    const s = deriveThreadSignals(msgs);
    expect(s.lastMessageAtMs).toBe(1000);
    expect(s.count).toBe(1);
  });

  it("gère un fil vide", () => {
    const s = deriveThreadSignals([]);
    expect(s.lastMessageAtMs).toBeNull();
    expect(s.lastInboundMessageId).toBeNull();
  });

  it("accepte des Timestamp-like (toMillis)", () => {
    const ts = (ms) => ({toMillis: () => ms});
    const s = deriveThreadSignals([
      {id: "a", labels: OUT, receivedAt: ts(500)},
      {id: "b", labels: IN, receivedAt: ts(700)},
    ]);
    expect(s.lastInboundAtMs).toBe(700);
    expect(s.lastOutboundAtMs).toBe(500);
  });

  it("trie chronologiquement et écarte les brouillons", () => {
    const ordered = sortThreadChronological([
      {id: "b", labels: IN, receivedAt: 3000},
      {id: "a", labels: IN, receivedAt: 1000},
      {id: "d", labels: ["DRAFT"], receivedAt: 2000},
    ]);
    expect(ordered.map((m) => m.id)).toEqual(["a", "b"]);
  });
});
