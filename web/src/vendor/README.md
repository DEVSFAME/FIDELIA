# `qrcode-generator.cjs` — dépendance **vendue**, pas installée

| Champ | Valeur |
|---|---|
| Paquet | `qrcode-generator` **1.4.4** |
| Auteur | Kazuhiko Arase — licence **MIT** (en-tête conservé dans le fichier) |
| Source | `https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js` |
| Taille | 56 694 o |
| SHA-256 | `18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780` |

## Pourquoi vendu et non installé

`npm` et `npx` **n'existent pas** dans l'environnement de reconstruction
(`which npm` → rien ; le `node` du PATH est Electron 43.8.3). Ajouter une
dépendance au `package.json` sans pouvoir l'installer produirait un dépôt qui ne
démarre pas — pire que pas de dépendance.

## Pourquoi celui-là

Écrire un encodeur QR à la main, c'est réimplémenter Reed-Solomon, le masquage
et le placement : ~400 lignes dont une erreur ne se voit **qu'au scan**, sur un
téléphone, chez un commerçant. Ce fichier est un encodeur éprouvé, sans aucune
dépendance, et son en-tête de licence est intact.

## Ce qu'il ne fait pas

Il ne **dessine** rien. `lib/qr.mjs` transforme sa matrice en chemin SVG ; c'est
là que se trouvent nos tests, pas dans le fichier vendu.

## Vérifier l'intégrité

```bash
shasum -a 256 web/src/vendor/qrcode-generator.cjs
# doit afficher 18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780
```
