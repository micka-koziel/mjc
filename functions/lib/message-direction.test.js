import {describe, it, expect} from "vitest";
import {isDraftMessage, messageDirection} from "./message-direction.js";

describe("message-direction (Sprint 83)", () => {
  it("isDraftMessage : true si DRAFT présent", () => {
    expect(isDraftMessage(["DRAFT"])).toBe(true);
    expect(isDraftMessage(["SENT", "DRAFT"])).toBe(true);
  });

  it("isDraftMessage : false sinon / entrée invalide", () => {
    expect(isDraftMessage(["INBOX"])).toBe(false);
    expect(isDraftMessage([])).toBe(false);
    expect(isDraftMessage(undefined)).toBe(false);
  });

  it("messageDirection : INBOX => inbound (prioritaire)", () => {
    expect(messageDirection(["INBOX"])).toBe("inbound");
    expect(messageDirection(["INBOX", "SENT"])).toBe("inbound");
  });

  it("messageDirection : SENT sans INBOX => outbound", () => {
    expect(messageDirection(["SENT"])).toBe("outbound");
    expect(messageDirection(["SENT", "IMPORTANT"])).toBe("outbound");
  });

  it("messageDirection : défaut inbound", () => {
    expect(messageDirection([])).toBe("inbound");
    expect(messageDirection(undefined)).toBe("inbound");
    expect(messageDirection(["CATEGORY_PERSONAL"])).toBe("inbound");
  });
});
