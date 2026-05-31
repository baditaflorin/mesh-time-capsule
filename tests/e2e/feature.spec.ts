import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

test("alice seals a 1-sec capsule, bob sees sealed → reveals → bob sees text", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await a.waitForTimeout(400);

    await a.getByPlaceholder("write your note…").fill("hello future room");
    await a.getByRole("button", { name: "1 sec", exact: true }).click();
    await a.getByRole("button", { name: "Seal it", exact: true }).click();

    await expect(b.locator(".capsule-list")).toContainText("alice");
    await expect(b.locator(".capsule-list")).toContainText("sealed");

    await a.waitForTimeout(1500);
    await a.getByRole("button", { name: /reveal mine/i }).click();

    await expect(b.locator(".capsule-list")).toContainText("hello future room");
  } finally {
    await cleanup();
  }
});

// Load-bearing test for the two advertised guarantees the first test never
// pinned down:
//   (1) "Commit-reveal sealed" — the note text MUST be hidden cross-peer while
//       the capsule is sealed. Only a SHA-256 commitment is on the wire; peer B
//       must not see the plaintext until the author reveals.
//   (2) "set an unlock time" — the reveal MUST be gated on the (mesh-clock)
//       deadline: the author cannot reveal before their unlock time.
test("sealed note is hidden cross-peer until the unlock deadline, then reveals", async ({
  browser,
  baseURL,
}) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByPlaceholder("your name").fill("alice");
    await b.getByPlaceholder("your name").fill("bob");
    await a.waitForTimeout(400);

    const secret = "SECRET-launch-codes-42";
    await a.getByPlaceholder("write your note…").fill(secret);
    // 1 minute — long enough that the reveal must be deadline-gated.
    await a.getByRole("button", { name: "1 min", exact: true }).click();
    await a.getByRole("button", { name: "Seal it", exact: true }).click();

    // Peer B sees the capsule is sealed…
    await expect(b.locator(".capsule-list")).toContainText("alice");
    await expect(b.locator(".capsule-list")).toContainText("sealed");
    // …but the plaintext is NOT on the wire — only the SHA-256 commitment.
    await expect(b.locator(".capsule-list")).not.toContainText(secret);
    // Belt-and-braces: the full page body of the OPPOSITE peer never carries it.
    await expect(b.locator("body")).not.toContainText(secret);

    // The author cannot reveal before the 1-min unlock deadline (mesh clock).
    await expect(a.getByRole("button", { name: /reveal mine/i })).toBeDisabled();
    // And peer B still has no plaintext after a beat.
    await a.waitForTimeout(800);
    await expect(b.locator("body")).not.toContainText(secret);

    // Now seal a SECOND, 1-sec capsule from peer B and prove reveal works once
    // its (short) deadline elapses — covering the unlock-then-reveal happy path
    // from the OPPOSITE peer and asserting cross-peer propagation of the reveal.
    const bobSecret = "bob-was-here-99";
    await b.getByPlaceholder("write your note…").fill(bobSecret);
    await b.getByRole("button", { name: "1 sec", exact: true }).click();
    await b.getByRole("button", { name: "Seal it", exact: true }).click();
    // Peer A must not see bob's plaintext while sealed either.
    await expect(a.locator("body")).not.toContainText(bobSecret);
    await b.waitForTimeout(1500);
    await b.getByRole("button", { name: /reveal mine/i }).click();
    // Reveal propagates to peer A.
    await expect(a.locator(".capsule-list")).toContainText(bobSecret);
  } finally {
    await cleanup();
  }
});
