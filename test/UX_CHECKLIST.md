# Manual UX checklist (pre-publish gate, TESTING.md layer 6)

Run in the Extension Development Host (or with the installed .vsix) before
any marketplace publish. Every box must pass in Dark Modern, Light Modern,
and a high-contrast theme.

## Core flow
- [ ] Open `examples/demo.http` — syntax highlighting renders; CodeLens
      appears within 1s
- [ ] Send a request — response panel opens beside, loading spinner shows,
      result renders with correct status color
- [ ] Cancel a slow request — panel shows "cancelled", no error toast
- [ ] Send All — progress notification with working cancel; summary table
      matches per-request results
- [ ] Malformed request (no URL) — warning toast, no crash, no console error

## Keyboard & accessibility
- [ ] Response tabs reachable by Tab; arrow keys move between tabs
- [ ] Focus outline visible on tabs and Copy button in all themes
- [ ] Copy button announces via status bar message
- [ ] No information conveyed by color alone (status also shows the number)

## Environments & variables
- [ ] Status bar item appears only when a .http editor is active
- [ ] Environment picker: current marked, switch persists across reload
- [ ] Unresolved {{vars}} visibly remain in the request (not silently empty)

## History & files
- [ ] Show Request History lists newest first with readable timestamps
- [ ] Save Last Response Body writes the file with the right extension
- [ ] .env next to the file is picked up without any configuration

## Performance feel
- [ ] 1000-request file (test corpus generator) scrolls and lenses smoothly
- [ ] 5MB JSON response renders without freezing the window

Last run: never — required before first publish.
