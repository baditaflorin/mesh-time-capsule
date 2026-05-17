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
