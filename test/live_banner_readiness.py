"""Wait for visible Today major-card artwork before capturing production evidence.

A rendered card can still have an undecoded official <img> while its themed
fallback is deliberately hidden. This source-free, read-only probe waits for
an actual decoded official image or for an explicit themed fallback.
No source is fetched here; the page itself owns image loading and error handling.
"""

BANNER_READY_PREDICATE = r"""() => {
  const cards = Array.from(document.querySelectorAll('#today-v1 article.t1-major'))
    .filter(card => card.getClientRects().length > 0);
  return cards.every(card => {
    const figure = card.querySelector('.t1-major-art .ev-art');
    if (!figure) return false;
    if (figure.getAttribute('data-art-kind') === 'themed')
      return !!figure.querySelector('.ev-art-theme');
    if (figure.getAttribute('data-art-kind') !== 'official') return false;
    const img = figure.querySelector('img.ev-art-img');
    return !!img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
  });
}"""

BANNER_STATUS_SCRIPT = r"""async () => {
  const cards = Array.from(document.querySelectorAll('#today-v1 article.t1-major'))
    .filter(card => card.getClientRects().length > 0);
  const result = {major_cards: cards.length, official_decoded: 0,
    themed_fallbacks: 0, not_ready: []};
  for (const card of cards) {
    const figure = card.querySelector('.t1-major-art .ev-art');
    const name = (card.querySelector('.t1-title')?.textContent || card.dataset.id || 'untitled').trim();
    if (!figure) { result.not_ready.push(name + ': no artwork figure'); continue; }
    if (figure.getAttribute('data-art-kind') === 'themed') {
      if (figure.querySelector('.ev-art-theme')) result.themed_fallbacks++;
      else result.not_ready.push(name + ': no visible themed fallback');
      continue;
    }
    const img = figure.querySelector('img.ev-art-img');
    if (!img || !img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
      result.not_ready.push(name + ': official image not loaded');
      continue;
    }
    try {
      await img.decode();
      result.official_decoded++;
    } catch (error) {
      result.not_ready.push(name + ': official image decode failed');
    }
  }
  return result;
}"""


def wait_for_today_banner_art(page, width: int, timeout_ms: int = 20000) -> dict:
    """Fail closed on a blank pending official banner; do not falsely pass art."""
    try:
        page.wait_for_function(BANNER_READY_PREDICATE, timeout=timeout_ms)
    except Exception as exc:
        raise AssertionError(
            f"{width}px: Today official banner did not load or show a themed fallback "
            f"within {timeout_ms}ms"
        ) from exc

    state = page.evaluate(BANNER_STATUS_SCRIPT)
    if (not isinstance(state, dict)
            or state.get("not_ready")
            or state.get("major_cards") != (
                state.get("official_decoded", 0) + state.get("themed_fallbacks", 0)
            )):
        raise AssertionError(f"{width}px: Today banner unresolved after image decode: {state}")
    print(
        f"PASS live Today banner art {width}px: "
        f"{state['official_decoded']} decoded official, "
        f"{state['themed_fallbacks']} visible themed fallback(s)",
        flush=True,
    )
    return state
