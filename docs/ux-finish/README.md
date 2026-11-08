# Mobile layout review for issue #364

Captured on 8 November 2026 with a Melbourne browser clock. “Before” uses the live production site. “After” previews the frontend changes; Today, Raids and Event Details inject `public/ux-finish.css` into production, while Research uses the local frontend with the same public snapshot and a captured production event feed. The site itself was not changed. Chromium captures were also reviewed at 375px and 430px. WebKit screenshots are retained by the PR's `webkit-mobile-surfaces` CI artifact.

| Surface | Before | After |
| --- | --- | --- |
| Today, 320px | [Before](today-320-before.png) | [After](today-320-after.png) |
| Today, desktop | [Before](today-desktop-before.png) | [After](today-desktop-after.png) |
| Raids, 390px | [Before](raids-390-before.png) | [After](raids-390-after.png) |
| Raids, desktop | [Before](raids-desktop-before.png) | [After](raids-desktop-after.png) |
| Event Details, 390px | [Before](detail-390-before.png) | [After](detail-390-after.png) |
| Research, 390px | [Before](research-390-before.png) | [After](research-390-after.png) |
