# Bundled official content packs

Every `.lcp` in this folder is an official LANCER content pack, packaged for
COMP/CON from the open data repositories published by Massif Press at
[github.com/massif-press](https://github.com/massif-press). They are shipped with
the application and installed (and activated) automatically on first run, so
official content — frames, weapons, systems, talents, bonds, NPCs — resolves out
of the box, offline, without anyone having to install a `.lcp` by hand.

| File              | Pack                                       | Author        | Version | Source |
| ----------------- | ------------------------------------------ | ------------- | ------- | ------ |
| `dustgrave.lcp`   | LANCER: Dustgrave                          | Ralf Ziegler  | 2.0.2   | [dustgrave-data](https://github.com/massif-press/dustgrave-data) |
| `ktb.lcp`         | Lancer KTB Data                            | Massif Press  | 2.0.2   | [ktb-data](https://github.com/massif-press/ktb-data) |
| `long-rim.lcp`    | Lancer Long Rim Data                       | Massif Press  | 2.0.2   | [long-rim-data](https://github.com/massif-press/long-rim-data) |
| `osr.lcp`         | Operation Solstice Rain Data               | Massif Press  | 2.0.1   | [osr-data](https://github.com/massif-press/osr-data) |
| `ows.lcp`         | Operation Winter Scar                      | Massif Press  | 2.0.1   | [ows-data](https://github.com/massif-press/ows-data) |
| `sotw.lcp`        | Shadow of the Wolf                         | Katherine Stark | 2.0.0 | [sotw-data](https://github.com/massif-press/sotw-data) |
| `ssmr.lcp`        | Siren's Song, A Mountain's Remorse         | NHP SHAKA     | 2.0.0   | [ssmr-data](https://github.com/massif-press/ssmr-data) |
| `wallflower.lcp`  | Lancer Wallflower Data                     | Massif Press  | 3.0.4   | [wallflower-data](https://github.com/massif-press/wallflower-data) |

`index.json` is the machine-readable version of that table: one entry per pack
with its file name, id (`base64(sha1("<author>/<name>"))`, the id COMP/CON uses),
name, author, version and the collections it provides. It is what
`src/io/OfficialContent.ts` reads at startup.

## Regenerating these files

```bash
npm run lcps          # bundle anything not present yet
npm run lcps:update   # re-download every pack at its newest version
```

`scripts/fetch-official-lcps.mjs` downloads each repository as a tarball (no API
token, so no rate limits) and re-zips the contents of its `lib/` folder at the
root of the archive — exactly how the upstream repositories build their own
`.lcp`. It picks, per pack, whichever of the `v3` / `master` branches carries the
newer manifest, so a pack is never silently downgraded.

Note that the LANCER game content itself belongs to Massif Press and the
individual authors above; these files are redistributed here only as the open
COMP/CON data they publish. Run `npm run lcps:update` instead of committing
updated archives if you would rather keep the packs out of version control.
