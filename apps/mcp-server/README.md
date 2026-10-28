# Neato Echo MCP server

Exposes your **Neato Echo meeting notes** — transcripts and summaries — to any
MCP‑capable AI agent (Claude Desktop, Claude Code, Cursor, etc.) as read‑only tools, so
another agent can search and absorb your meetings.

It signs into **your** Neato Cloud account with the publishable key + your email/password,
so Supabase row‑level security scopes everything to your data. No service‑role key.

## Tools

| Tool | What it does |
|---|---|
| `search_meetings` | Search meetings/notes by title, summary, or transcript text. |
| `list_meetings` | List recent meetings; optional `since`/`until` (YYYY‑MM‑DD) or `folder`. |
| `get_meeting` | Full meeting: title, date, duration, summary, readable transcript. |
| `list_folders` | List your folders. |

## Setup

```bash
cd apps/mcp-server
npm install
cp .env.example .env      # then edit .env with your Neato Cloud email + password
node src/index.js         # optional smoke test — Ctrl+C to stop
```

## Add it to an agent

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "neato-echo": {
      "command": "node",
      "args": ["C:/Users/markh/openwhisper/apps/mcp-server/src/index.js"],
      "env": {
        "NEATO_EMAIL": "you@example.com",
        "NEATO_PASSWORD": "your-password"
      }
    }
  }
}
```

**Claude Code** — `claude mcp add neato-echo -- node C:/Users/markh/openwhisper/apps/mcp-server/src/index.js`
(then set `NEATO_EMAIL` / `NEATO_PASSWORD` in its env), or add the same block to your MCP config.

Restart the agent; it will have the four tools above and can search/read your meetings.

## Notes

- Read‑only: the server only ever `SELECT`s. It never writes, updates, or deletes.
- Credentials live in `.env` (git‑ignored) or the agent's `env` block — never committed.
- Requires you to be signed into Neato Cloud (the same account your desktop/mobile app uses).
