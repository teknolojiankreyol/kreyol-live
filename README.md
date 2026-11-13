# Kreyòl Live

Live English → Haitian Creole captions for church services. They show on the church screens through ProPresenter, on members' phones, and on a livestream.

```
Pastor's mic → soundboard → computer (Chrome) → Claude translates → ProPresenter / phones / big screen
```

## What you need

- A computer that can hear the service (soundboard feed into a USB audio interface, or a mic near a speaker)
- Google Chrome or Microsoft Edge (used for the English speech recognition)
- [Node.js](https://nodejs.org) 20 or newer
- A Claude API key from <https://console.anthropic.com>

## Start it

```bash
cd kreyol-live
npm install
export ANTHROPIC_API_KEY=sk-ant-...      # Windows PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-..."
npm start
```

To try it without an API key (it fakes the translations):

```bash
npm run demo
```

Then open **http://localhost:3000/operator** in Chrome and click **Start listening** (allow the microphone), or **Run demo sermon**.

| Page | Who uses it | Address |
|---|---|---|
| Operator | Media team | `http://localhost:3000/operator` |
| Phones | Congregation (scan the QR code on the operator page; same Wi-Fi) | `http://<computer-ip>:3000/` |
| Big screen / OBS | Projector or livestream browser source | `http://<computer-ip>:3000/display` (add `?transparent=1` for OBS) |

## Connect ProPresenter 7

1. In ProPresenter: **Settings → Network → Enable Network**. Note the IP address and port.
2. Create a **Message** named `Kreyol` whose text is a single **Text token** named `Text`. Style it like a lower third (font size, position, background).
3. On the operator page, enter the IP and port, click **Test connection**, then tick **Send captions to ProPresenter**.

Each translated sentence replaces the message text on the screens. **Clear screens** clears it.

> The connection uses ProPresenter's `/v1/message/{id}/trigger` API. It was tested against a stand-in server, not a real ProPresenter. If **Test connection** works but captions don't appear, check the API docs under ProPresenter's Network settings to confirm the token format.

## Improving the Creole

- **`glossary.json`** lists preferred church words (Bondye, Sentespri, gras…). Have a bilingual member review and extend it; the translator follows it. Restart the app after editing.
- Each line is translated with the previous six lines as context, so pronouns and topics stay consistent.

## Known limits (prototype)

- About 2–5 seconds behind the speaker.
- Chrome's speech recognition sends audio to Google and works best with a clean soundboard feed, not a room mic.
- Settings are reset when the app restarts.
- Songs should be pre-translated in ProPresenter rather than translated live.
