---
type: rea
status: done
module: global
tags: [rea, fidelix, design-system, css]
updated: 2026-10-26
---

# Design system

Source : `raw/assets/_next_static_css_0baee74d463a534b.css` (132 499 o) et
`_next_static_css_d34d95ecc21099a8.css` (12 316 o) + manifestes PWA.

## 1. Couleurs

| Rôle | Valeur | Occurrences |
|---|---|---|
| Accent principal / `theme_color` | `#f94c3a` | 5 |
| Accent chaud | `#f85b04` | 4 |
| Encre foncée | `#1d1a18` | 5 |
| Fond clair | `#faf9f8` | 5 |
| Fond PWA | `#fcede7` | manifeste |
| POS `theme_color` | `#1a1a1a` | manifeste caisse |
| WhatsApp | `#25d366` | 3 |
| Violet (accent secondaire) | `#7c3aed` | 2 |
| Vert pâle (succès) | `#34d399`, `#4ade80`, `#6ee7b7` | 1 chacun |

Palette complète : `contrats.json` §`design.couleurs` (30 valeurs mesurées).

## 2. Typographie

| Rôle | Famille | Occurrences |
|---|---|---|
| Script (accroches) | **Caveat** | 13 |
| Display / titres | **Space Grotesk** | 10 |
| Texte | **Inter** | 8 |
| Mono (codes clients `C-XXXXXX`) | **JetBrains Mono** | 7 |
| Impact (chiffres XL) | **Anton** | 4 |

Variables : `--font-sans`, `--font-mono`, `--font-script`, `--font-display`,
`--font-impact` (chaque famille a un `* Fallback` généré par `next/font`).

## 3. Motif « verre » (glassmorphism) — deux jeux de valeurs

```
--verre: 255 255 255            --verre: 72 66 61
--verre-opacite: 0.17 | 0.26 | 0.94 | 0.97 | 1
--verre-opacite-forte: 0.10 | 0.16 | 0.94 | 0.97 | 1
--verre-bord: 255 255 255       --verre-bord-opacite: 0.09 | 0.16 | 0.42 | 1
--verre-ombre: 0 0 0 | 22 21 20 --verre-ombre-opacite: 0.10 | 0.55
--verre-flou: 0px | 22px        --verre-flou-fort: 0px | 34px
--verre-saturation: 140% | 165%

--vitre-fond: #2a2826 | rgb(22 21 20 / 0.1)
--vitre-bord: rgb(255 255 255 / 0.10 → 0.55)
--vitre-arete: rgb(255 255 255 / 0.10 → 0.70)
--vitre-ombre: …
```

Interprétation mesurable : deux peaux cohérentes (« clair » : verre blanc opaque
0.94–1 ; « sombre » : verre blanc translucide 0.10–0.26 avec flou 22–34 px).
Les valeurs `0px` de `--verre-flou` correspondent au mode « sans flou »
(performance ou `prefers-reduced-transparency`).

## 4. Texture

`--grain-opacite: 0 | 0.045 | 0.055` + filtre SVG `feTurbulence`
(`baseFrequency`, `numOctaves: 2`, `seed: 3`, `scale: 10`, `xChannelSelector="R"`,
`yChannelSelector="G"`) ⇒ bruit fractal superposé, désactivable.

## 5. Peaux & préférences

| Clé `localStorage` | Effet |
|---|---|
| `fidelix_theme` | clair / sombre |
| `fidelix_skin` | « nouveau look » / « ancien look » |
| `fidelix_rail` | rail rangé ou déployé |

Libellés du shell (preuve : layout privé) : « Mode clair », « Mode sombre »,
« Nouveau look », « Ancien look », « Essayer le nouveau look », « Ranger le menu »,
« Palette ».

## 6. Ce qui reste à mesurer

- [ ] Rayons (`border-radius`) et ombres par composant — non extraits (motif non
      recherché dans cette passe).
- [ ] Grille et breakpoints du dashboard (exige une session).
- [ ] La carte wallet elle-même (rendu Apple/Google) : c'est un **contrat externe**,
      pas du CSS web.

## 7. Conséquence pour la reconstruction

Le design n'est pas « à imiter à l'œil » : il est **paramétré**. Reproduire les
variables (`--verre-*`, `--vitre-*`, `--grain-opacite`) donne les deux peaux d'un
coup, et rend la fidélité vérifiable par `getComputedStyle`.
