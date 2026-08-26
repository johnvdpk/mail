import { describe, expect, it } from "vitest";
import { scanWebsiteContent } from "./website-scan";

describe("scanWebsiteContent", () => {
  it("detects platforms, hooks and multi-location signals", () => {
    const html = `
      <html>
        <body>
          <h1>Familiecamping aan het water</h1>
          <p>Wij zijn Jan en Piet. Honden welkom. Camperplaatsen beschikbaar.</p>
          <p>Onze locaties in Nederland.</p>
          <script src="https://tommybooking.nl/widget.js"></script>
        </body>
      </html>
    `;
    const scan = scanWebsiteContent(html);
    expect(scan.platforms.some((p) => p.id === "tommy")).toBe(true);
    expect(scan.multiLocation).toBe(true);
    expect(scan.hooks.length).toBeGreaterThan(0);
    expect(scan.summaryLines.length).toBeGreaterThan(0);
  });
});
