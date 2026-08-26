import { describe, expect, it } from "vitest";
import { buildForwardedBody, buildThreadingHeaders } from "./send-service";
import type { ThreadDetail, ThreadMessage } from "../shared/types";

function message(partial: Partial<ThreadMessage> & Pick<ThreadMessage, "id">): ThreadMessage {
  return {
    folder: "INBOX",
    uid: 1,
    references: [],
    to: [{ email: "me@example.com", name: "Me" }],
    cc: [],
    subject: "Onderwerp",
    snippet: "Snippet",
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

describe("send-service helpers", () => {
  it("builds threading headers from unique message ids", () => {
    const detail: ThreadDetail = {
      thread: {
        id: "t1",
        subject: "Thread",
        participants: [],
        folders: ["INBOX"],
        lastDate: "2026-01-15T10:00:00.000Z",
        unread: false,
        flagged: false,
        hasAttachments: false,
        snippet: "",
        messageCount: 2,
        messageIds: ["m1", "m2"],
      },
      messages: [
        message({ id: "m1", messageId: "<a@mail>" }),
        message({ id: "m2", messageId: "<b@mail>" }),
        message({ id: "m3", messageId: "<b@mail>" }),
      ],
    };

    expect(buildThreadingHeaders(detail)).toEqual({
      inReplyTo: "<b@mail>",
      references: ["<a@mail>", "<b@mail>"],
    });
  });

  it("builds forwarded body blocks per message", () => {
    const body = buildForwardedBody([
      message({
        id: "m1",
        from: { email: "jan@acme.nl", name: "Jan" },
        subject: "Offerte",
        to: [{ email: "me@example.com" }],
        body: { id: "m1", text: "Hallo!", attachments: [], loadedAt: "2026-01-15T10:00:00.000Z" },
      }),
    ]);

    expect(body).toContain("---------- Doorgestuurd bericht ----------");
    expect(body).toContain("Van: Jan <jan@acme.nl>");
    expect(body).toContain("Onderwerp: Offerte");
    expect(body).toContain("Hallo!");
  });
});
