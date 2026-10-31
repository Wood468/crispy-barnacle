import unittest
from production_image_audit import image_kind, payload_bytes, resource_label, summarize

class ProductionImageAuditTests(unittest.TestCase):
    def test_recognises_r2_poster_paths(self):
        self.assertEqual(image_kind("https://pogo.michaelpuff.com/infographics/event-1.webp?cache=1"), "infographic-poster")
        self.assertEqual(image_kind("https://pogo.michaelpuff.com/img/ext/event-2.webp"), "infographic-poster")

    def test_other_images_are_not_counted_as_posters(self):
        self.assertEqual(image_kind("https://raw.githubusercontent.com/PokeAPI/sprites/pokemon/25.png"), "other-image")

    def test_payload_size_prefers_content_length_and_falls_back_to_body(self):
        self.assertEqual(payload_bytes({"content-length": "1234"}, b"abc"), 1234)
        self.assertEqual(payload_bytes({}, b"abc"), 3)
        self.assertEqual(payload_bytes({"content-length": "invalid"}, b"abc"), 3)

    def test_resource_label_omits_query_and_fragment(self):
        self.assertEqual(resource_label("https://cdn.example.test/poster.webp?token=secret#view"), "cdn.example.test/poster.webp")

    def test_summary_separates_poster_bytes_from_other_images(self):
        result = summarize([
            {"kind": "infographic-poster", "bytes": 1200, "resource": "site/poster.webp", "status": 200},
            {"kind": "other-image", "bytes": 800, "resource": "site/icon.png", "status": 200},
            {"kind": "infographic-poster", "bytes": 300, "resource": "site/second.webp", "status": 200},
        ])
        self.assertEqual(result["image_responses"], 3)
        self.assertEqual(result["image_payload_bytes"], 2300)
        self.assertEqual(result["poster_responses"], 2)
        self.assertEqual(result["poster_payload_bytes"], 1500)
        self.assertEqual(result["largest_posters"][0]["resource"], "site/poster.webp")

if __name__ == "__main__":
    unittest.main()
