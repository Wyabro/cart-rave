// MONTAGE-ESC-1: nothing called montagePage() before this test existed, so the re-export
// bug that broke esc() inside it (CC-ESC-1 giving `esc` no local binding) shipped without
// a single test catching it. This pins the happy path so a future edit to montage.mjs's
// import/export of `esc` fails loudly here instead of only at `npm run states` runtime.
import { describe, it, expect } from "vitest";
import { montagePage } from "../tools/lib/montage.mjs";

describe("montagePage", () => {
  it("escapes the title (both call sites) and passes the stamp through unescaped", () => {
    const html = montagePage({
      title: "<b>HUD</b> sheet",
      stamp: "12 cells <live>",
      banner: "",
      cardsHtml: "",
    });

    // <title>: escaped title, lowercase-preserved
    expect(html).toContain("<title>Cart Clash — &lt;b&gt;HUD&lt;/b&gt; sheet</title>");
    // <h1>: same title, escaped then uppercased (.toUpperCase() also upcases the
    // entity text itself, so "&lt;" becomes "&LT;" — that's correct, not a bug)
    expect(html).toContain("&LT;B&GT;HUD&LT;/B&GT; SHEET");
    // stamp is interpolated raw, not escaped — assert the literal text survives verbatim
    expect(html).toContain('<div class="stamp">12 cells <live></div>');
  });
});
