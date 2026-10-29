#!/usr/bin/env python3
"""Fetch the newest infographic mirrored into a Discord channel.

Required environment:
  DISCORD_TOKEN  Bot token stored as a GitHub Actions secret.
  CHANNEL_ID     ID of a channel the bot can view and read.

The script only reads Discord and writes a review-pending JSON candidate. It never
posts to Discord or automatically publishes an image into the production webapp.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

API_BASE = "https://discord.com/api/v10"
OUTPUT_FILE = Path(os.environ.get("INFOGRAPHICS_FILE", "infographics.json"))
IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".bmp", ".tif", ".tiff")


class DiscordApiError(RuntimeError):
    pass


def discord_get_messages(token: str, channel_id: str, limit: int = 10, before: str = "") -> list[dict[str, Any]]:
    """Read messages (the latest 10 by default), retrying Discord rate limits and transient errors."""
    url = f"{API_BASE}/channels/{urllib.parse.quote(channel_id, safe='')}/messages?limit={int(limit)}"
    if before:
        url += f"&before={urllib.parse.quote(before, safe='')}"
    for attempt in range(4):
        request = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bot {token}",
                "User-Agent": "GO-Field-Notes-Discord-Infographic-Sync/1.0 (GitHub Actions)",
                "Accept": "application/json",
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if not isinstance(payload, list):
                raise DiscordApiError("Discord API response was not a message list.")
            return payload
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            if exc.code == 429 and attempt < 3:
                try:
                    delay = float(json.loads(body).get("retry_after", 2))
                except (ValueError, TypeError, json.JSONDecodeError):
                    delay = 2
                time.sleep(min(max(delay, 1), 30))
                continue
            if exc.code >= 500 and attempt < 3:
                time.sleep(2 ** attempt)
                continue
            if exc.code in (401, 403):
                raise DiscordApiError(
                    f"Discord returned HTTP {exc.code}. Check DISCORD_TOKEN and ensure "
                    "the bot is in your server with View Channel and Read Message History."
                ) from exc
            if exc.code == 404:
                raise DiscordApiError(
                    "Discord returned HTTP 404. Check CHANNEL_ID and that the bot can access it."
                ) from exc
            raise DiscordApiError(f"Discord API HTTP {exc.code}: {body[:300]}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt < 3:
                time.sleep(2 ** attempt)
                continue
            raise DiscordApiError(f"Could not reach Discord API: {exc}") from exc
    raise DiscordApiError("Discord API request exhausted retries.")


def is_image_attachment(attachment: dict[str, Any]) -> bool:
    content_type = str(attachment.get("content_type") or "").lower()
    filename = str(attachment.get("filename") or "").lower().split("?", 1)[0]
    return content_type.startswith("image/") or filename.endswith(IMAGE_EXTENSIONS)


def is_infographic_attachment(attachment: dict[str, Any]) -> bool:
    """Keep only full-size, infographic-shaped artwork; reject cropped screenshots/cards.

    G47IX event graphics are tall or near-square, high-resolution images. Discord
    supplies dimensions for normal uploads and embeds. Unknown/small dimensions are
    deliberately excluded so incidental screenshots do not enter the approval queue.
    """
    try:
        width = int(attachment.get("width") or 0)
        height = int(attachment.get("height") or 0)
    except (TypeError, ValueError):
        return False
    if width <= 0 or height <= 0:
        return False
    short_edge, long_edge = sorted((width, height))
    aspect = width / height
    return short_edge >= 600 and width * height >= 500_000 and 0.35 <= aspect <= 1.5


def is_forwarded_message(message: dict[str, Any]) -> bool:
    """Recognise common Followed Channel/crosspost markers without needing source-server access."""
    author = message.get("author") or {}
    flags = int(message.get("flags") or 0)
    return bool(
        message.get("webhook_id")
        or message.get("message_reference")
        or flags & 1  # Discord MessageFlags.CROSSPOSTED
        or author.get("system")
        or author.get("bot")
        or int(message.get("type") or 0) != 0
    )


def image_record(messages: list[dict[str, Any]], channel_id: str) -> dict[str, Any] | None:
    # Manual forwards may not carry Discord's crosspost flags. Accept image
    # attachments and embed images, then leave every candidate pending review.
    for message in messages:
        # Forwarded Discord messages may store original media in message_snapshots.
        # The outer flags value 16384 is MessageFlags.HAS_SNAPSHOT.
        sources = [message]
        for snapshot in message.get("message_snapshots") or []:
            if isinstance(snapshot, dict) and isinstance(snapshot.get("message"), dict):
                sources.append(snapshot["message"])

        attachments = []
        content = ""
        author = message.get("author") or {}
        for source in sources:
            source_attachments = [
                item for item in (source.get("attachments") or [])
                if isinstance(item, dict) and item.get("url") and is_image_attachment(item) and is_infographic_attachment(item)
            ]
            for embed in source.get("embeds") or []:
                if not isinstance(embed, dict):
                    continue
                image = embed.get("image") or embed.get("thumbnail") or {}
                url = image.get("url") or image.get("proxy_url")
                if url and is_infographic_attachment(image):
                    source_attachments.append({
                        "url": url,
                        "filename": url.rsplit("/", 1)[-1].split("?", 1)[0] or "forwarded-image",
                        "content_type": "image/unknown",
                        "width": image.get("width"),
                        "height": image.get("height"),
                    })
            if source_attachments:
                attachments.extend(source_attachments)
                if not content:
                    content = str(source.get("content") or "").strip()
                if source.get("author"):
                    author = source.get("author") or author
        if not attachments:
            continue

        attachment = max(
            attachments,
            key=lambda item: int(item.get("width") or 0) * int(item.get("height") or 0),
        )
        message_id = str(message.get("id") or "")
        guild_id = str(message.get("guild_id") or "")
        message_url = (
            f"https://discord.com/channels/{guild_id}/{channel_id}/{message_id}"
            if guild_id and message_id else None
        )
        return {
            "source": "discord",
            "review_status": "pending",
            "channel_id": str(channel_id),
            "message_id": message_id,
            "message_url": message_url,
            "author": str(author.get("global_name") or author.get("username") or "Unknown"),
            "title": content.splitlines()[0][:240] if content else str(attachment.get("filename") or "Pokémon GO infographic"),
            "text": content[:4000],
            "timestamp": message.get("timestamp"),
            "image_url": str(attachment["url"]),
            "attachment_filename": str(attachment.get("filename") or ""),
            "attachment_width": attachment.get("width"),
            "attachment_height": attachment.get("height"),
            "discovered_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
    return None


def load_previous(path: Path) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (OSError, json.JSONDecodeError) as exc:
        raise DiscordApiError(f"Could not read {path}; refusing to overwrite it: {exc}") from exc
    if not isinstance(value, dict):
        raise DiscordApiError(f"{path} must contain a JSON object; refusing to overwrite it.")
    return value


def sync(token: str, channel_id: str, output_file: Path = OUTPUT_FILE) -> bool:
    messages = discord_get_messages(token, channel_id)
    candidate = image_record(messages, channel_id)
    if candidate is None:
        print("No image attachment or embed found in the latest 10 messages; existing file left unchanged.")
        print("Safe message diagnostics (no message text, image URLs, or credentials):")
        for index, message in enumerate(messages, start=1):
            author = message.get("author") or {}
            attachments = message.get("attachments") or []
            embeds = message.get("embeds") or []
            embed_images = sum(
                1 for embed in embeds
                if isinstance(embed, dict) and (embed.get("image") or embed.get("thumbnail"))
            )
            attachment_types = [
                str(item.get("content_type") or "missing")
                for item in attachments if isinstance(item, dict)
            ]
            attachment_names = [
                str(item.get("filename") or "missing")
                for item in attachments if isinstance(item, dict)
            ]
            print(
                f"message[{index}]: id={message.get('id', 'missing')}, "
                f"type={message.get('type', 'missing')}, flags={message.get('flags', 0)}, "
                f"author={author.get('username') or author.get('global_name') or 'unknown'}, "
                f"bot={bool(author.get('bot'))}, content_length={len(str(message.get('content') or ''))}, "
                f"attachments={len(attachments)}, attachment_types={attachment_types}, "
                f"attachment_filenames={attachment_names}, embeds={len(embeds)}, "
                f"embed_images_or_thumbnails={embed_images}"
            )
        return False

    previous = load_previous(output_file)
    # URL is the stable identity requested; don't rewrite solely because discovery time changed.
    if previous and previous.get("image_url") == candidate["image_url"]:
        print("Latest infographic URL matches infographics.json; no file changes made.")
        return False

    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(json.dumps(candidate, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"New infographic candidate saved to {output_file} (review_status=pending).")
    return True


HISTORY_FILE = Path(os.environ.get("INFOGRAPHICS_HISTORY_FILE", "infographics-history.json"))


def history(token: str, channel_id: str, days: int, fetch=discord_get_messages, now: datetime | None = None) -> list[dict[str, Any]]:
    """Every image post from the last `days` days, newest first. Read-only; used to review older graphics.

    Discord's picture links expire after about a day, so this runs just before the pictures are downloaded
    rather than being saved ahead of time.
    """
    now = now or datetime.now(timezone.utc)
    cutoff = now.timestamp() - days * 86400
    records: list[dict[str, Any]] = []
    before = ""
    for _ in range(40):  # up to 4,000 messages
        page = fetch(token, channel_id, 100, before)
        if not page:
            break
        for message in page:
            stamp = datetime.fromisoformat(str(message.get("timestamp")).replace("Z", "+00:00")).timestamp() if message.get("timestamp") else now.timestamp()
            if stamp < cutoff:
                continue
            record = image_record([message], channel_id)
            if record:
                records.append(record)
        oldest = page[-1].get("timestamp")
        before = str(page[-1].get("id") or "")
        if not before or len(page) < 100 or (oldest and datetime.fromisoformat(str(oldest).replace("Z", "+00:00")).timestamp() < cutoff):
            break
        time.sleep(0.6)
    return records


def main() -> int:
    token = os.environ.get("DISCORD_TOKEN", "").strip()
    channel_id = os.environ.get("CHANNEL_ID", "").strip()
    if not token or not channel_id:
        print("Missing required environment variable(s): DISCORD_TOKEN and CHANNEL_ID.", file=sys.stderr)
        return 2
    if not channel_id.isdigit():
        print("CHANNEL_ID must be a numeric Discord channel ID.", file=sys.stderr)
        return 2
    try:
        days = int(os.environ.get("DISCORD_HISTORY_DAYS", "0") or 0)
        if days > 0:
            records = history(token, channel_id, min(days, 120))
            HISTORY_FILE.write_text(json.dumps({"fetched": datetime.now(timezone.utc).isoformat(timespec="seconds"), "items": records}, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"Read {len(records)} image posts from the last {days} days into {HISTORY_FILE}.")
            return 0
        sync(token, channel_id)
    except DiscordApiError as exc:
        print(f"Discord infographic sync failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
