import { test, expect } from "@playwright/test"

test("tiles API returns valid JSON", async ({ request }) => {
  const res = await request.get("/api/tiles?when=t24")

  expect(res.ok()).toBeTruthy()
  expect(res.headers()["content-type"]).toContain("application/json")

  const json = await res.json()
  expect(json).toHaveProperty("success")

  if (json.success) {
    expect(json.data).toHaveProperty("cells")
    expect(Array.isArray(json.data.cells)).toBe(true)
  }
})

test("tiles API handles invalid when parameter", async ({ request }) => {
  const res = await request.get("/api/tiles?when=invalid")

  expect(res.ok()).toBeTruthy()
  const json = await res.json()
  expect(json).toHaveProperty("success")
})
