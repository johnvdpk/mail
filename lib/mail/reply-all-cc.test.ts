import { describe, expect, it } from "vitest";
import type { ThreadDetail, ThreadMessage } from "@/lib/shared/types";
import { replyAllCc } from "./reply-all-cc";

const ACCOUNT = "me@example.com";

function message(partial: Partial<ThreadMessage> & Pick<ThreadMessage, "id">): ThreadMessage {
  return {
    folder: "INBOX",
    uid: 1,
    references: [],
    to: [{ email: ACCOUNT }],
    cc: [],
    subject: "Hi",
    snippet: "",
    date: "2026-01-15T10:00:00.000Z",
    seen: true,
    flagged: false,
    answered: false,
    draft: false,
    hasAttachments: false,
    outbound: false,
    ...partial,
  };
}

function detail(messages: ThreadMessage[]): ThreadDetail {
  return {
    thread: {
      id: "t1",
      subject: "Hi",
      participants: [
        { email: ACCOUNT },
        { email: "a@example.com" },
        { email: "b@example.com" },
      ],
      folders: ["INBOX"],
      lastDate: "2026-01-15T10:00:00.000Z",
      unread: false,
      flagged: false,
      hasAttachments: false,
      snippet: "",
      messageCount: messages.length,
      messageIds: messages.map((m) => m.id),
    },
    messages,
  };
}

describe("replyAllCc", () => {
  it("adds other recipients from an inbound mail, not the sender or self", () => {
    const cc = replyAllCc(
      detail([
        message({
          id: "m1",
          from: { email: "a@example.com" },
          to: [{ email: ACCOUNT }, { email: "b@example.com" }],
          cc: [{ email: "c@example.com" }],
        }),
      ]),
      ACCOUNT
    );
    expect(cc).toBe("b@example.com, c@example.com");
  });

  it("is empty for a 1:1 inbound mail", () => {
    const cc = replyAllCc(
      detail([
        message({
          id: "m1",
          from: { email: "a@example.com" },
          to: [{ email: ACCOUNT }],
        }),
      ]),
      ACCOUNT
    );
    expect(cc).toBe("");
  });

  it("keeps CC from the last outbound mail", () => {
    const cc = replyAllCc(
      detail([
        message({
          id: "m1",
          from: { email: "a@example.com" },
          to: [{ email: ACCOUNT }],
        }),
        message({
          id: "m2",
          outbound: true,
          from: { email: ACCOUNT },
          to: [{ email: "a@example.com" }],
          cc: [{ email: "b@example.com" }],
        }),
      ]),
      ACCOUNT
    );
    expect(cc).toBe("b@example.com");
  });
});
