import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from production_image_audit import detail_poster_results, image_kind, is_today_tab, payload_bytes, resource_label, scroll_positions, season_thumbnail_path, summarize, write_matrix_summary

class ProductionImageAuditTests(unittest.TestCase):
    def test_recognises_r2_poster_paths(self):
        self.assertEqual(image_kind("https://pogo.michaelpuff.com/infographics/event-1.webp?cache=1"), "infographic-poster")
        self.assertEqual(image_kind("https://pogo.michaelpuff.com/img/ext/event-2.webp"), "infographic-poster")
        self.assertEqual(image_kind("https://pogo.michaelpuff.com/infographic-thumbs/g47ix/event-3.jpg.webp"), "infographic-thumbnail")
        self.assertEqual(image_kind("https://pogo.michaelpuff.com/season-thumbs/season-24-a1b2c3d4.webp"), "season-thumbnail")

    def test_season_thumbnail_path_matches_the_browser_and_generator_naming_rule(self):
        item = {"id": "season:24", "img": "/img/ext/season-24-twilight-trails-99c978ed.jpg"}
        self.assertEqual(season_thumbnail_path(item), "/season-thumbs/season-24-49a5f9d7.webp")
        self.assertEqual(season_thumbnail_path({"id": "season:24"}), "")

    def test_current_season_records_produce_valid_detail_thumbnail_paths(self):
        root = Path(__file__).resolve().parent.parent
        season = json.loads((root / "public" / "season.json").read_text(encoding="utf-8"))
        for item in season.get("items", []):
            if item.get("img"):
                self.assertRegex(
                    season_thumbnail_path(item),
                    r"^/season-thumbs/season-[a-z0-9-]+-[a-f0-9]{8}\\.webp$",
                    item.get("id", ""),
                )

    def test_other_images_are_not_counted_as_posters(self):
        self.assertEqual(image_kind("https://raw.githubusercontent.com/PokeAPI/sprites/pokemon/25.png"), "other-image")

    def test_payload_size_prefers_content_length_and_falls_back_to_body(self):
        self.assertEqual(payload_bytes({"content-length": "1234"}, b"abc"), 1234)
        self.assertEqual(payload_bytes({}, b"abc"), 3)
        self.assertEqual(payload_bytes({"content-length": "invalid"}, b"abc"), 3)

    def test_resource_label_omits_query_and_fragment(self):
        self.assertEqual(resource_label("https://cdn.example.test/poster.webp?token=secret#view"), "cdn.example.test/poster.webp")

    def test_scroll_positions_cover_the_document_with_overlapping_viewports(self):
        self.assertEqual(scroll_positions(600, 800), [0])
        self.assertEqual(scroll_positions(2500, 800), [0, 600, 1200, 1700])
        positions = scroll_positions(5000, 320)
        self.assertEqual(positions[0], 0)
        self.assertEqual(positions[-1], 4680)
        self.assertEqual(positions, sorted(set(positions)))

    def test_today_tab_selector_supports_live_and_boot_navigation(self):
        self.assertTrue(is_today_tab({"data-tab": "now"}))
        self.assertTrue(is_today_tab({"data-boot-tab": "now"}))
        self.assertTrue(is_today_tab({"aria-controls": "tab-now"}))
        self.assertFalse(is_today_tab({"data-tab": "events", "aria-controls": "tab-events"}))

    def test_detail_poster_results_only_count_responses_after_opening_details(self):
        expected = [
            {"id": "season:24", "name": "Twilight Trails", "thumbnail_resource": "pogo.example/season-thumb.webp", "original_resource": "pogo.example/season.jpg"},
            {"id": "season:pass-oct", "name": "GO Pass: October", "thumbnail_resource": "pogo.example/pass-thumb.webp", "original_resource": "pogo.example/pass.jpg"},
            {"id": "season:old", "name": "Older season", "thumbnail_resource": "", "original_resource": "pogo.example/old.jpg"},
        ]
        records = [
            {"phase": "today", "resource": "pogo.example/season.jpg", "status": 200, "bytes": 900, "kind": "infographic-poster"},
            {"phase": "season_details_on_demand", "resource": "pogo.example/season-thumb.webp", "status": 200, "bytes": 120, "kind": "season-thumbnail"},
            {"phase": "season_details_on_demand", "resource": "pogo.example/pass.jpg", "status": 200, "bytes": 700, "kind": "infographic-poster"},
        ]
        result = detail_poster_results(expected, records)
        self.assertEqual([item["loaded"] for item in result], [True, True, False])
        self.assertEqual([item["thumbnail_loaded"] for item in result], [True, False, False])
        self.assertEqual([item["original_fallback_loaded"] for item in result], [False, True, False])
        self.assertEqual([item["bytes"] for item in result], [120, 700, 0])
        self.assertIsNone(result[2]["status"])

    def test_matrix_summary_reports_card_thumbnail_bytes_separately(self):
        sample = summarize([
            {"kind": "infographic-poster", "bytes": 1200, "resource": "site/poster.webp", "status": 200},
            {"kind": "other-image", "bytes": 800, "resource": "site/icon.png", "status": 200},
            {"kind": "infographic-poster", "bytes": 300, "resource": "site/second.webp", "status": 200},
            {"kind": "infographic-thumbnail", "bytes": 150, "resource": "site/thumb.webp", "status": 200},
            {"kind": "season-thumbnail", "bytes": 120, "resource": "site/season-thumb.webp", "status": 200},
        ])
        empty = summarize([])
        report = {
            "measured_at_utc": "2026-11-03T00:00:00+00:00",
            "target": "https://pogo.michaelpuff.com/",
            "profiles": [{
                "profile": "mobile-compact",
                "viewport": {"width": 320, "height": 740},
                "device_scale_factor": 3,
                "phases": {
                    "today_initial": sample,
                    "schedule_activation_incremental": empty,
                    "schedule_deep_scroll": empty,
                    "today_reactivation": empty,
                    "season_details_on_demand": empty,
                },
                "schedule_scroll": {"steps": 1, "content_height": 740},
                "season_detail_posters": [],
                "season_detail_errors": [],
                "page_errors": [],
            }],
            "offline_cache": {
                "service_worker_controlled": True,
                "offline_reload_ok": True,
                "online_schedule_opened": True,
                "offline_schedule_opened": True,
                "today_restored_online": True,
                "offline_image_responses_from_service_worker": 1,
                "blocked_non_read_requests": [],
                "blocked_api_requests": [],
                "unblocked_non_read_requests": [],
                "failed_images": [],
                "page_errors": [],
                "phases": {
                    "online_today": sample,
                    "online_schedule_deep_scroll": empty,
                    "offline_reload_today": sample,
                    "offline_schedule_deep_scroll": empty,
                },
            },
        }
        with tempfile.TemporaryDirectory() as folder:
            summary_path = Path(folder) / "summary.md"
            with patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": str(summary_path)}):
                write_matrix_summary(report)
            summary = summary_path.read_text(encoding="utf-8")
        self.assertIn("Thumbnail assets", summary)
        self.assertIn("Thumbnail payload", summary)
        self.assertIn("| Today initial load | 5 | 2,570 B | 2 | 1,500 B | 2 | 270 B |", summary)
        self.assertIn("| Offline cached Today reload | 5 | 2,570 B | 2 | 1,500 B | 2 | 270 B |", summary)
        self.assertIn("Largest thumbnails in today_initial", summary)
        self.assertIn("site/thumb.webp", summary)

    def test_summary_separates_poster_bytes_from_other_images(self):
        result = summarize([
            {"kind": "infographic-poster", "bytes": 1200, "resource": "site/poster.webp", "status": 200},
            {"kind": "other-image", "bytes": 800, "resource": "site/icon.png", "status": 200},
            {"kind": "infographic-poster", "bytes": 300, "resource": "site/second.webp", "status": 200},
            {"kind": "infographic-thumbnail", "bytes": 150, "resource": "site/thumb.webp", "status": 200},
            {"kind": "season-thumbnail", "bytes": 120, "resource": "site/season-thumb.webp", "status": 200},
        ])
        self.assertEqual(result["image_responses"], 5)
        self.assertEqual(result["image_payload_bytes"], 2570)
        self.assertEqual(result["poster_responses"], 2)
        self.assertEqual(result["poster_payload_bytes"], 1500)
        self.assertEqual(result["thumbnail_responses"], 2)
        self.assertEqual(result["thumbnail_payload_bytes"], 270)
        self.assertEqual(result["season_thumbnail_responses"], 1)
        self.assertEqual(result["season_thumbnail_payload_bytes"], 120)
        self.assertEqual(result["largest_posters"][0]["resource"], "site/poster.webp")
        self.assertEqual(result["largest_images"][0]["resource"], "site/poster.webp")
        self.assertEqual(result["largest_images"][0]["kind"], "infographic-poster")

if __name__ == "__main__":
    unittest.main()
