import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import discord_scraper


class DiscordScraperSyncTests(unittest.TestCase):
    def message(self, image_url="https://cdn.discordapp.com/attachments/1/2/infographic.png", **changes):
        message = {
            "id": "message-123",
            "guild_id": "guild-1",
            "type": 0,
            "flags": 1,
            "timestamp": "2026-10-11T10:00:00+00:00",
            "content": "October Community Day infographic\nEvent details",
            "author": {"username": "Followed Channel"},
            "attachments": [{
                "id": "attachment-1",
                "filename": "infographic.png",
                "content_type": "image/png",
                "url": image_url,
                "proxy_url": "https://media.discordapp.net/preview.png",
                "width": 2400,
                "height": 3200,
            }],
        }
        message.update(changes)
        return message

    def test_extracts_direct_url_title_text_and_timestamp(self):
        record = discord_scraper.image_record([self.message()], "123456789")
        self.assertEqual(record["image_url"], "https://cdn.discordapp.com/attachments/1/2/infographic.png")
        self.assertEqual(record["title"], "October Community Day infographic")
        self.assertEqual(record["text"], "October Community Day infographic\nEvent details")
        self.assertEqual(record["timestamp"], "2026-10-11T10:00:00+00:00")
        self.assertEqual(record["review_status"], "pending")

    def test_selects_newest_forwarded_image(self):
        newer = self.message("https://cdn.discordapp.com/new.png")
        older = self.message("https://cdn.discordapp.com/old.png")
        older["id"] = "old"
        self.assertEqual(discord_scraper.image_record([newer, older], "123456789")["image_url"],
                         "https://cdn.discordapp.com/new.png")

    def test_accepts_manual_forward_without_crosspost_markers(self):
        ordinary = self.message()
        ordinary["flags"] = 0
        self.assertEqual(discord_scraper.image_record([ordinary], "123456789")["image_url"], "https://cdn.discordapp.com/attachments/1/2/infographic.png")

    def test_extracts_image_from_forwarded_message_snapshot(self):
        forwarded = self.message()
        forwarded["flags"] = 16384
        forwarded["attachments"] = []
        forwarded["embeds"] = []
        forwarded["content"] = ""
        forwarded["message_snapshots"] = [{
            "message": {
                "content": "G47IX infographic title",
                "author": {"username": "g47ix"},
                "attachments": [{
                    "id": "snapshot-attachment",
                    "filename": "g47ix-guide.png",
                    "content_type": "image/png",
                    "url": "https://cdn.discordapp.com/snapshots/g47ix-guide.png",
                    "width": 3000,
                    "height": 4000,
                }],
                "embeds": [],
            }
        }]
        record = discord_scraper.image_record([forwarded], "123456789")
        self.assertEqual(record["image_url"], "https://cdn.discordapp.com/snapshots/g47ix-guide.png")
        self.assertEqual(record["title"], "G47IX infographic title")
        self.assertEqual(record["author"], "g47ix")
        self.assertEqual(record["review_status"], "pending")

    def test_extracts_image_from_embed_inside_forwarded_snapshot(self):
        forwarded = self.message()
        forwarded["flags"] = 16384
        forwarded["attachments"] = []
        forwarded["embeds"] = []
        forwarded["message_snapshots"] = [{
            "message": {
                "content": "Forwarded infographic",
                "embeds": [{
                    "image": {
                        "url": "https://cdn.discordapp.com/snapshots/embed.png",
                        "width": 1200,
                        "height": 1800,
                    }
                }],
            }
        }]
        record = discord_scraper.image_record([forwarded], "123456789")
        self.assertEqual(record["image_url"], "https://cdn.discordapp.com/snapshots/embed.png")

    def test_extracts_image_from_embed(self):
        message = self.message()
        message["attachments"] = []
        message["flags"] = 0
        message["embeds"] = [{"image": {"url": "https://cdn.discordapp.com/embedded-image.png", "width": 1600, "height": 2200}}]
        record = discord_scraper.image_record([message], "123456789")
        self.assertEqual(record["image_url"], "https://cdn.discordapp.com/embedded-image.png")
        self.assertEqual(record["review_status"], "pending")

    def test_selects_highest_resolution_attachment(self):
        message = self.message()
        message["attachments"].append({
            "id": "attachment-2",
            "filename": "infographic-hd.png",
            "content_type": "image/png",
            "url": "https://cdn.discordapp.com/hd.png",
            "width": 4000,
            "height": 5000,
        })
        self.assertEqual(discord_scraper.image_record([message], "123456789")["image_url"],
                         "https://cdn.discordapp.com/hd.png")

    def test_same_url_does_not_rewrite_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "infographics.json"
            prior = self.message()
            record = discord_scraper.image_record([prior], "123456789")
            record["discovered_at"] = "old"
            path.write_text(json.dumps(record), encoding="utf-8")
            before = path.read_text(encoding="utf-8")
            with patch.object(discord_scraper, "discord_get_messages", return_value=[prior]):
                changed = discord_scraper.sync("token", "123456789", path)
            self.assertFalse(changed)
            self.assertEqual(path.read_text(encoding="utf-8"), before)

    def test_no_image_does_not_change_existing_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "infographics.json"
            path.write_text('{"image_url":"keep"}', encoding="utf-8")
            before = path.read_text(encoding="utf-8")
            ordinary = self.message()
            ordinary["flags"] = 0
            ordinary["attachments"] = []
            ordinary["embeds"] = []
            with patch.object(discord_scraper, "discord_get_messages", return_value=[ordinary]):
                changed = discord_scraper.sync("token", "123456789", path)
            self.assertFalse(changed)
            self.assertEqual(path.read_text(encoding="utf-8"), before)


if __name__ == "__main__":
    unittest.main()
