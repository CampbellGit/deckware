/**
 * End-to-end: take a real migration-plan deck through the full pipeline
 * (parse → export self-contained HTML), load it in a real browser, navigate
 * every slide, and screenshot each one. Also asserts the deck actually behaves
 * like a deck: one slide visible at a time, keyboard navigation works.
 */
import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { parse } from "../src/core/parse";
import { exportHtml } from "../src/core/export-html";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const shotsDir = resolve(root, "e2e/screenshots");

// Build the deck HTML once, write it where the browser can load it.
const source = readFileSync(resolve(root, "examples/migration-plan.slide"), "utf8");
const { deck, warnings } = parse(source);
const html = exportHtml(deck);
const htmlPath = resolve(shotsDir, "migration-plan.html");
mkdirSync(shotsDir, { recursive: true });
writeFileSync(htmlPath, html);
const url = pathToFileURL(htmlPath).href;

test("deck parses without warnings", () => {
  expect(warnings).toEqual([]);
  expect(deck.slides.length).toBe(11);
});

test("renders every slide one at a time and screenshots them", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(url);

  const slides = page.locator(".deck-slide");
  await expect(slides).toHaveCount(deck.slides.length);

  for (let i = 0; i < deck.slides.length; i++) {
    // Exactly one slide is active (visible) at any time.
    await expect(page.locator(".deck-slide.active")).toHaveCount(1);
    const active = page.locator(".deck-slide.active");
    await expect(active).toHaveAttribute("data-index", String(i));

    const layout = deck.slides[i].layout.name;
    const n = String(i + 1).padStart(2, "0");
    await active.locator(".slide").screenshot({
      path: resolve(shotsDir, `slide-${n}-${layout}.png`),
    });

    if (i < deck.slides.length - 1) {
      await page.keyboard.press("ArrowRight");
    }
  }

  // The HUD should report the last slide after navigating through.
  await expect(page.locator("#page")).toHaveText(String(deck.slides.length));
  expect(errors, "no runtime errors in the player").toEqual([]);
});

test("arrow-left navigates backwards", async ({ page }) => {
  await page.goto(url);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".deck-slide.active")).toHaveAttribute("data-index", "2");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".deck-slide.active")).toHaveAttribute("data-index", "1");
});
