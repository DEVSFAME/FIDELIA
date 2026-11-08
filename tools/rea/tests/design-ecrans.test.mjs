/* ============================================================================
   Gardes de **mise en page** — ce qui se voit et qui casse sans bruit.

   Trois écrans, une feuille, et des défauts qu'aucun test de données ne peut
   voir :

     1. **La palette morte.** `JaugePoints` peignait sa piste en `bg-white/10`
        et son remplissage en `bg-coral` — les utilitaires de la peau « verre »,
        retirée par la refonte Unicity. Sur une carte claire, la piste était
        *invisible* et l'orange jurait avec l'accent bleu. Rien ne le signalait :
        le composant rendait, les chiffres étaient justes, l'écran était faux.
     2. **La colonne fantôme.** `/caisse` passe en deux colonnes à 1240 px. Poser
        la grille sans carte ouvre une colonne de 320 px vide à droite : sur un
        grand écran, la moitié de la page est un trou.
     3. **L'affiche qui ne s'imprime pas.** `/qrcode` sert à produire un objet
        physique. Sans cadre blanc ni bouton d'impression, l'écran affiche un
        code correct que personne ne peut coller sur un comptoir.
     4. **La zone sûre ignorée.** Un `padding-bottom` fixe sous une barre de
        navigation fixe laisse le dernier bouton sous la barre système d'un
        iPhone à encoche — et sur mobile, c'est le geste principal qui est coupé.

   Aucun test ici n'ouvre de navigateur : on lit le source et la feuille. Ce qui
   se juge au pixel demande une session (cf. `PROGRESS.md`, dette déclarée).
   ========================================================================== */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { dictionnaire } from '../../../web/src/i18n/index.mjs'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const lire = (...morceaux) => readFileSync(join(RACINE, ...morceaux), 'utf8')

const CAISSE = lire('web', 'src', 'app', '(dashboard)', 'caisse', 'page.jsx')
const QRCODE = lire('web', 'src', 'app', '(dashboard)', 'qrcode', 'page.jsx')
const JAUGE = lire('web', 'src', 'components', 'tableau', 'JaugePoints.jsx')
const CSS = lire('web', 'src', 'styles', 'unicity.css')
const FR = dictionnaire('fr')

test('peau — la jauge ne dépend plus de la palette « verre »', () => {
  // `bg-coral` et `bg-white/10` viennent de `tokens.css` (palette mesurée sur
  // l'ancienne cible). La peau servie est Unicity : ses couleurs sont `--uc-*`.
  // On lit le **code**, pas l'en-tête : le commentaire du composant cite les
  // deux classes mortes pour expliquer pourquoi elles ont disparu.
  const code = JAUGE.replace(/\/\*[\s\S]*?\*\//g, ' ')

  assert.equal(/\bbg-coral\b/.test(code), false, 'la jauge repeint en orange de la peau retirée')
  assert.equal(/\bbg-white\/10\b/.test(code), false, 'la piste redevient invisible sur carte claire')
  assert.equal(/\bfont-impact\b/.test(code), false, 'la police Impact n’est pas celle d’Unicity')

  assert.match(code, /className="uc-solde"/)
  assert.match(code, /className="uc-jauge"/)
  assert.match(code, /className="uc-jauge-remplie"/)

  // …et les classes existent vraiment dans la feuille : un nom inventé rend un
  // composant nu sans qu'aucun test ne rougisse.
  for (const classe of ['.uc-solde {', '.uc-solde-val {', '.uc-jauge {', '.uc-jauge-remplie {']) {
    assert.ok(CSS.includes(classe), `classe absente de la feuille : ${classe}`)
  }
})

test('caisse — la grille n’est posée que s’il y a une seconde colonne', () => {
  // Une `uc-grille` sans carte remplirait 320 px avec du vide à partir de
  // 1240 px, et la colonne de gauche se tasserait d'autant.
  assert.match(
    CAISSE,
    /<div className=\{lisible \? 'uc-grille' : undefined\}>/,
    'la grille est posée inconditionnellement : colonne fantôme sur grand écran'
  )

  // L'ordre du DOM suit le geste : identifier, lire le solde, choisir.
  const identification = CAISSE.indexOf("t('page.caisse.identification')")
  const solde = CAISSE.indexOf("t('page.caisse.solde')")
  const recompenses = CAISSE.indexOf("t('page.caisse.recompenses')")
  assert.ok(identification > -1, 'le titre d’identification a disparu')
  assert.ok(solde > identification, 'le solde précède l’identification dans le DOM')
  assert.ok(recompenses > solde, 'les récompenses précèdent la lecture du solde')
})

test('caisse — le solde a son texte, et le bouton sa cible tactile', () => {
  for (const cle of ['page.caisse.identification', 'page.caisse.saisie', 'page.caisse.solde']) {
    assert.equal(typeof FR[cle], 'string', `clé absente du dictionnaire : ${cle}`)
  }

  // 44 px = `h-11` : la hauteur minimale d'une cible tactile (§UX, danger haut).
  assert.match(CAISSE, /className="uc-btn uc-btn-primary h-11 sm:mt-auto"/)
})


test('qrcode — l’affiche est prête à imprimer', () => {
  assert.match(QRCODE, /className="uc-affiche mt-4"/, 'l’affiche a perdu son cadre blanc')
  assert.match(QRCODE, /<span className="uc-affiche-lien">\{url\}<\/span>/)
  assert.match(QRCODE, /import \{ BoutonImpression \}/)
  assert.match(
    QRCODE,
    /actions=\{<BoutonImpression>\{t\('page\.qrcode\.imprimer'\)\}<\/BoutonImpression>\}/,
    'le bouton d’impression n’est plus dans l’en-tête de l’écran'
  )

  // Le QR doit rester imposant : à 120 px, un téléphone à 40 cm ne le lit pas.
  const taille = QRCODE.match(/<QrCode texte=\{url\} taille=\{(\d+)\}/)
  assert.ok(taille, 'le QR a perdu sa taille explicite')
  assert.ok(Number(taille[1]) >= 200, `le QR est trop petit pour être scanné : ${taille[1]} px`)

  for (const cle of ['page.qrcode.affiche', 'page.qrcode.afficheNote', 'page.qrcode.imprimer']) {
    assert.equal(typeof FR[cle], 'string', `clé absente du dictionnaire : ${cle}`)
  }

  // À l'impression, l'affiche perd son cadre pointillé : le papier n'a pas
  // besoin d'un trait de découpe.
  assert.match(CSS, /@media print \{[\s\S]*?\.uc-affiche \{/)
})

test('mobile — la zone sûre est respectée sous la barre de navigation', () => {
  assert.match(
    CSS,
    /padding: 16px 16px calc\(96px \+ env\(safe-area-inset-bottom\)\)/,
    'le bas de page ignore la zone sûre : le dernier bouton passe sous la barre système'
  )
  assert.match(
    CSS,
    /padding: 20px 24px calc\(104px \+ env\(safe-area-inset-bottom\)\)/,
    'le palier 640 px a perdu la zone sûre'
  )

  // La barre basse la respecte déjà : on le vérifie pour que personne ne la
  // « simplifie » en `padding: 6px 4px`.
  assert.match(CSS, /\.uc-bottom \{[^}]*safe-area-inset-bottom/)
})

test('mobile — un appui se voit avant la navigation', () => {
  // 0,55 à 0,81 s de réponse serveur : sans retour tactile, le doigt croit
  // avoir manqué sa cible et appuie deux fois.
  assert.match(CSS, /touch-action: manipulation/, 'le délai de 300 ms du double-tap revient')
  assert.match(CSS, /-webkit-tap-highlight-color: transparent/, 'le flash bleu système revient')
  assert.match(CSS, /\.uc a:active,[\s\S]*?transform: scale\(0\.985\)/, 'aucun retour à l’appui')
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.uc a:active/)
})

