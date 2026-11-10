# Collection binder prototype

Run this command from the project directory:

```sh
node prototypes/binder/serve.mjs
```

Open <http://127.0.0.1:8792/>. Use `BINDER_PORT` to select a different local port.

- Drag a card from **Unplaced cards** to a pocket. Drag a placed card onto another to swap them. If a card from the tray replaces a placed card, the placed card goes to the tray.
- To use touch or the keyboard, select a card and then select a pocket. Select a placed card and use **Return to tray** to clear its pocket.
- Try **4** and **9** pockets per page. Each size has its own saved positions. **Add pages** opens a new spread with two empty pages. **Undo** reverses the last edit for the current pocket size.
- Use **List** to see all sample cards and their positions in the current layout. **Reset demo** restores both sample layouts.

The server listens on loopback and serves only prototype files and the existing public Kanto sprites. The demo uses a fixed sample collection and saves layouts in this browser. Card images use TCGdex source URLs. If a card image is unavailable, the demo shows a sample face with the existing sprite. The prototype is outside the app build and needs no account, database, or new package.
