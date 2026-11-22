import json, os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import store_snapshot as S


class Evidence(unittest.TestCase):
    def test_shape(self):
        sections = [{"name": "ITEMS", "count": 2}, {"name": "POKECOINS", "count": 1}]
        e = S.build_completeness(passes=4, stable_passes=2, max_passes=20, sections=sections)
        self.assertEqual(e["schema"], 1)
        self.assertEqual(e["producer"], "store_snapshot.py")
        self.assertTrue(e["loadComplete"])
        self.assertEqual(e["cards"], 3)
        self.assertEqual(e["sections"], sections)
        self.assertNotIn("verified", e)

    def test_not_complete_when_scroll_never_stabilised(self):
        e = S.build_completeness(passes=20, stable_passes=1, max_passes=20, sections=[{"name": "ITEMS", "count": 1}])
        self.assertFalse(e["loadComplete"])

    def test_stable_scroll_stops_after_two_unchanged_passes(self):
        reads = iter([[{"name": "A", "count": 1}], [{"name": "A", "count": 3}], [{"name": "A", "count": 3}], [{"name": "A", "count": 3}], [{"name": "A", "count": 9}]])
        passes, stable, sections = S.scroll_until_stable(lambda: next(reads), lambda: None, max_passes=20)
        self.assertEqual((passes, stable, sections), (4, 2, [{"name": "A", "count": 3}]))

    def test_scroll_cap_reports_unstable(self):
        n = iter(range(100))
        passes, stable, _ = S.scroll_until_stable(lambda: [{"name": "A", "count": next(n)}], lambda: None, max_passes=5)
        self.assertEqual((passes, stable), (5, 0))


if __name__ == "__main__":
    unittest.main()
