"""Credit-free owner UI smoke test. Requires injected owner session; aborts render RPC before server."""
import asyncio
import base64
import json
import os
from playwright.async_api import async_playwright


async def main():
    if os.environ.get("LOVABLE_BROWSER_AUTH_STATUS") != "injected":
        raise RuntimeError("An injected owner session is required; no render will be sent.")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        calls = []

        async def guard(route):
            encoded = route.request.url.split("/_serverFn/")[-1].split("?")[0]
            try:
                decoded = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode()
            except Exception:
                decoded = ""
            if route.request.method != "GET":
                # Deny every mutation; even unknown/production hashes cannot spend credits.
                calls.append("startFilmRender" in decoded)
                await route.abort("blockedbyclient")
            else:
                await route.continue_()

        await page.goto("http://localhost:8080")
        await page.evaluate("([k,v])=>localStorage.setItem(k,v)", [
            os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"],
            os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"],
        ])
        cookies = json.loads(os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON") or "[]")
        if cookies:
            await context.add_cookies([{**c, "url": "http://localhost:8080"} for c in cookies])
        await page.evaluate("localStorage.setItem('storyreel_session_id','a4c962f6-17c3-4073-9719-2f61f441a135')")
        await page.goto("http://localhost:8080/film/d893842c-16fb-4416-ad8e-8714ef269dbb")
        button = page.get_by_role("button", name="Render 5 scenes · 70 credits", exact=True)
        await button.wait_for()
        await page.route("**/_serverFn/**", guard)
        await button.click()
        await page.get_by_role("alert").wait_for()
        assert calls == [True], "The click must reach exactly one intercepted startFilmRender request"
        print("PASS: authenticated five-scene click intercepted before server; zero paid calls.")
        await browser.close()


asyncio.run(main())