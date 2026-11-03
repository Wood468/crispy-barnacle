"""Real-browser regression for the Places modal's keyboard focus containment."""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("GO_FIELD_NOTES_TEST_URL", "http://127.0.0.1:8791/")

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.goto(BASE, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_function("!!window.GOPLACES", timeout=20000)
    page.evaluate("window.GOPLACES.open('')")
    page.wait_for_function("!!document.querySelector('#plc') && !document.querySelector('#plc').hidden", timeout=10000)

    selector = '#plc a[href],#plc button:not([disabled]),#plc input:not([disabled]),#plc select:not([disabled]),#plc textarea:not([disabled]),#plc summary,#plc [tabindex]:not([tabindex="-1"])'
    count = page.locator(selector).count()
    assert count >= 2, f"expected at least two focusable Places controls, found {count}"

    page.evaluate("""(selector) => {
      const dialog = document.querySelector('#plc');
      const items = Array.from(dialog.querySelectorAll(selector)).filter((el) =>
        !el.closest('[hidden],[aria-hidden="true"]') && el.getClientRects().length > 0
      );
      items[0].focus();
    }""", selector)
    page.keyboard.press("Shift+Tab")
    reverse_wrapped = page.evaluate("""(selector) => {
      const dialog = document.querySelector('#plc');
      const items = Array.from(dialog.querySelectorAll(selector)).filter((el) =>
        !el.closest('[hidden],[aria-hidden="true"]') && el.getClientRects().length > 0
      );
      return document.activeElement === items[items.length - 1];
    }""", selector)
    assert reverse_wrapped, "Shift+Tab from the first control must wrap to the last control"

    page.evaluate("""(selector) => {
      const dialog = document.querySelector('#plc');
      const items = Array.from(dialog.querySelectorAll(selector)).filter((el) =>
        !el.closest('[hidden],[aria-hidden="true"]') && el.getClientRects().length > 0
      );
      items[items.length - 1].focus();
    }""", selector)
    page.keyboard.press("Tab")
    forward_wrapped = page.evaluate("""(selector) => {
      const dialog = document.querySelector('#plc');
      const items = Array.from(dialog.querySelectorAll(selector)).filter((el) =>
        !el.closest('[hidden],[aria-hidden="true"]') && el.getClientRects().length > 0
      );
      return document.activeElement === items[0];
    }""", selector)
    assert forward_wrapped, "Tab from the last control must wrap to the first control"

    print(f"PASS: Places dialog contains keyboard focus in both directions ({count} controls)")
    browser.close()
