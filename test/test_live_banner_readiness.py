"""Deterministic guard for read-only production Today image readiness."""
import unittest

from live_banner_readiness import (
    BANNER_READY_PREDICATE,
    BANNER_STATUS_SCRIPT,
    wait_for_today_banner_art,
)


class FakePage:
    def __init__(self, state, error=None):
        self.state = state
        self.error = error
        self.calls = []

    def wait_for_function(self, script, timeout):
        self.calls.append(("wait", timeout, script))
        if self.error is not None:
            raise self.error

    def evaluate(self, script):
        self.calls.append(("decode", script))
        return self.state


class BannerReadinessTests(unittest.TestCase):
    def test_loaded_official_image_is_decoded_before_screenshot(self):
        page = FakePage({"major_cards": 1, "official_decoded": 1,
                         "themed_fallbacks": 0, "not_ready": []})
        result = wait_for_today_banner_art(page, 320, timeout_ms=9000)
        self.assertEqual(result["official_decoded"], 1)
        self.assertEqual([x[0] for x in page.calls], ["wait", "decode"])
        self.assertEqual(page.calls[0][1], 9000)
        self.assertIn("img.complete", BANNER_READY_PREDICATE)
        self.assertIn("img.naturalWidth > 0", BANNER_READY_PREDICATE)
        self.assertIn("await img.decode()", BANNER_STATUS_SCRIPT)

    def test_genuine_themed_fallback_is_not_a_blank_banner(self):
        page = FakePage({"major_cards": 1, "official_decoded": 0,
                         "themed_fallbacks": 1, "not_ready": []})
        self.assertEqual(wait_for_today_banner_art(page, 390)["themed_fallbacks"], 1)

    def test_pending_image_timeout_fails_closed(self):
        page = FakePage({}, error=TimeoutError("image never loaded"))
        with self.assertRaisesRegex(AssertionError, "320px: Today official banner"):
            wait_for_today_banner_art(page, 320, timeout_ms=50)
        self.assertEqual([x[0] for x in page.calls], ["wait"])

    def test_failed_decode_fails_closed(self):
        page = FakePage({"major_cards": 1, "official_decoded": 0,
                         "themed_fallbacks": 0, "not_ready": ["GO Wild Area: decode failed"]})
        with self.assertRaisesRegex(AssertionError, "430px: Today banner unresolved"):
            wait_for_today_banner_art(page, 430)

    def test_missing_major_artwork_figure_fails_closed(self):
        page = FakePage({"major_cards": 2, "official_decoded": 1,
                         "themed_fallbacks": 0, "not_ready": []})
        with self.assertRaises(AssertionError):
            wait_for_today_banner_art(page, 360)

    def test_future_days_with_no_major_cards_remain_valid(self):
        page = FakePage({"major_cards": 0, "official_decoded": 0,
                         "themed_fallbacks": 0, "not_ready": []})
        self.assertEqual(wait_for_today_banner_art(page, 360)["major_cards"], 0)


if __name__ == "__main__":
    unittest.main()
