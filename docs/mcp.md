# Lokales MCP

Die App besitzt einen separaten MCP-Konnektor für **lokale Studio-Projektexporte**. Er ist kein Bestandteil des neutralen SDK-Core und öffnet keinen öffentlichen HTTP-Endpunkt.

Ein berechtigter lokaler App-Checkout mit installierten Abhängigkeiten, gebautem SDK und Node 26 kann durch einen MCP-Client gestartet werden:

```json
{
  "mcpServers": {
    "fabriqon": {
      "command": "node",
      "args": ["/pfad/zum/app/scripts/mcp-server.mjs", "--directory", "/pfad/zu/projektexporten"]
    }
  }
}
```

Verfügbare Lesewerkzeuge sind `list_projects`, `read_project`, `validate_project`, `assess_project` und `compare_projects`. Erst mit `--allow-write` erscheinen `create_project` und `save_project`.

Schreiben benötigt den Hash des zuletzt gelesenen Dateistands. Veraltete Änderungen, vorhandene Namen beim Anlegen, Freigabemetadaten, verknüpfte Dateien und Pfade außerhalb des ausdrücklich gewählten Verzeichnisses werden abgewiesen. Dateien enden auf `.dfproj.json` und dürfen höchstens 2 MB groß sein. Ausgaben auf stdout sind ausschließlich MCP-Protokoll; deshalb direkt `node` als Befehl verwenden.

Live-Datenbankzugriff, ein Remote-MCP-Endpunkt und Berechtigungen je Live-Projekt sind noch nicht implementiert. Die Website-/Demo-Bereitstellung startet keinen zusätzlichen MCP-Dienst.
