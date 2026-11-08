#!/usr/bin/env node
/* ============================================================================
   Campagne de mutations — §27.4 : pas de témoin d'application, pas de conclusion.

     node tools/rea/campagne-mutations.mjs

   Chaque entrée dit : un fichier, un texte **exact** à remplacer, son
   remplacement, et les tests qui doivent parler. Le harnais refuse une
   substitution qui ne s'applique pas **exactement une fois** — c'est l'échec de
   la première campagne R3 : un motif qui s'appliquait zéro fois rendait un test
   vert, et ce vert certifiait un garde qui n'avait jamais servi.

   Il imprime le diff (le témoin) **avant** le résultat, puis restaure le
   fichier et vérifie que la restauration est exacte. Une mutation non détectée
   fait sortir en code 1.

   Ce n'est pas un test : le fichier ne finit pas par `.test.mjs` et n'est donc
   pas ramassé par `node --test tools/rea/tests/*.test.mjs`.

   ⚠️ Rediriger la sortie vers un fichier, jamais dans un tube (`| head`) : le
   tube fermé tue le processus au milieu d'une mutation, et la campagne suivante
   mesure un arbre à moitié muté sans le dire. C'est arrivé.
   ========================================================================== */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const executer = promisify(execFile)

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Un diff minimal, juste assez pour voir que le fichier a changé. */
function diff(avant, apres) {
  const a = avant.split('\n')
  const b = apres.split('\n')
  const lignes = []
  const total = Math.max(a.length, b.length)
  for (let i = 0; i < total; i += 1) {
    if (a[i] !== b[i]) {
      if (a[i] !== undefined) lignes.push(`  - ${i + 1}: ${a[i].slice(0, 100)}`)
      if (b[i] !== undefined) lignes.push(`  + ${i + 1}: ${b[i].slice(0, 100)}`)
    }
  }
  return lignes
}

async function lancer(tests) {
  try {
    const { stdout, stderr } = await executer('node', ['--test', ...tests], { cwd: RACINE })
    return { sortie: stdout + stderr, code: 0 }
  } catch (erreur) {
    return { sortie: (erreur.stdout ?? '') + (erreur.stderr ?? ''), code: erreur.code ?? 1 }
  }
}

/* ---------------------------------------------------------------------------
   L'arbre de départ, et la sortie unique
   ---------------------------------------------------------------------------
   Trois mécanismes, pour trois façons de mourir :

     1. **Un instantané** de tous les fichiers visés, lu *avant* la première
        écriture. La restauration ne dépend donc pas de ce que le disque
        contient au moment du drame — c'est ce qui manquait quand `get('confirm')`
        est resté en place : le processus est mort entre l'écriture et la
        restauration, et la campagne suivante a mesuré un arbre corrompu en
        l'annonçant comme sain.
     2. **Un marqueur** sur disque, écrit avant la première mutation et retiré
        après la dernière restauration vérifiée. S'il est encore là au
        démarrage, la campagne précédente n'a pas fini : on refuse de démarrer
        au lieu de mesurer un arbre qu'on ne connaît pas.
     3. **Un vérificateur de sortie** : après restauration, chaque fichier est
        comparé octet à octet à son instantané. Une restauration incomplète fait
        sortir en code 1, même si toutes les mutations ont été détectées.
--------------------------------------------------------------------------- */

const MARQUEUR = join(RACINE, 'tools/rea/.campagne-mutations.etat')

/** Empreinte courte : deux contenus identiques ont la même, un écart se lit. */
const empreinte = (texte) => createHash('sha256').update(texte, 'utf8').digest('hex').slice(0, 12)

/** `fichier -> contenu d'origine`, rempli une seule fois, avant la première écriture. */
const SNAPSHOT = new Map()

function chargerSnapshot(entrees) {
  const ecarts = []
  for (const { nom, fichier } of entrees) {
    if (SNAPSHOT.has(fichier)) continue
    const chemin = join(RACINE, fichier)
    if (!existsSync(chemin)) {
      ecarts.push(`${nom} : ${fichier} est introuvable`)
      continue
    }
    SNAPSHOT.set(fichier, readFileSync(chemin, 'utf8'))
  }
  return ecarts
}

/** Remet chaque fichier visé dans son état d'origine, sans rien supposer du disque. */
function restaurerTout() {
  for (const [fichier, original] of SNAPSHOT) {
    const chemin = join(RACINE, fichier)
    let actuel = null
    try {
      actuel = readFileSync(chemin, 'utf8')
    } catch {
      actuel = null
    }
    if (actuel === original) continue
    try {
      writeFileSync(chemin, original, 'utf8')
    } catch {
      // Le vérificateur de sortie le dira ; on ne masque pas l'échec ici.
    }
  }
}

function ecartsDeRestauration() {
  const ecarts = []
  for (const [fichier, original] of SNAPSHOT) {
    const chemin = join(RACINE, fichier)
    const actuel = existsSync(chemin) ? readFileSync(chemin, 'utf8') : null
    if (actuel === original) continue
    ecarts.push(
      `${fichier} : ${actuel === null ? 'absent' : empreinte(actuel)} au lieu de ${empreinte(original)}`
    )
  }
  return ecarts
}

let termine = false

/** La seule sortie : restaurer, vérifier, retirer le marqueur, sortir. */
function sortir(code) {
  if (termine) return
  termine = true

  restaurerTout()
  const ecarts = ecartsDeRestauration()
  if (ecarts.length > 0) {
    console.error('ARRÊT — la restauration est incomplète :')
    for (const ecart of ecarts) console.error('  ' + ecart)
    code = 1
  }

  try {
    rmSync(MARQUEUR, { force: true })
  } catch {
    // Le marqueur restera : la prochaine campagne refusera de démarrer, et
    // c'est exactement le comportement voulu.
  }
  process.exit(code)
}

// `exit` ne peut faire que du travail synchrone : c'est le dernier filet, pour
// le cas où `process.exit` est appelé par une dépendance.
process.on('exit', () => {
  if (termine) return
  restaurerTout()
  try {
    rmSync(MARQUEUR, { force: true })
  } catch {
    // idem
  }
})

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => sortir(130))
}
process.on('uncaughtException', (erreur) => {
  console.error(`EXCEPTION NON RATTRAPÉE : ${erreur?.stack ?? erreur}`)
  sortir(1)
})
process.on('unhandledRejection', (erreur) => {
  console.error(`REJET NON RATTRAPÉ : ${erreur?.stack ?? erreur}`)
  sortir(1)
})

/** Refuse de démarrer si l'arbre n'est pas celui qu'on croit. */
function verifierArbre(entrees) {
  const ecarts = []
  for (const { nom, fichier, ancien, nouveau } of entrees) {
    // La référence est l'instantané, pas le disque : si les deux divergent, la
    // mutation s'appliquerait à un fichier que personne n'a annoncé.
    const source = SNAPSHOT.get(fichier)
    if (source === undefined) {
      ecarts.push(`${nom} : ${fichier} n'a pas été lu (fichier absent ?)`)
      continue
    }

    const occurrences = source.split(ancien).length - 1
    if (occurrences !== 1) ecarts.push(`${nom} : ${occurrences} occurrence(s) dans ${fichier}`)

    // Une mutation qui rendrait le fichier identique ne prouverait rien.
    if (source.includes(nouveau) && !ancien.includes(nouveau)) {
      ecarts.push(`${nom} : le texte muté est déjà présent dans ${fichier} (arbre sale ?)`)
    }
  }
  return ecarts
}

async function muter({ nom, fichier, ancien, nouveau, tests }) {
  const chemin = join(RACINE, fichier)
  const original = readFileSync(chemin, 'utf8')
  const reference = SNAPSHOT.get(fichier) ?? original
  const occurrences = original.split(ancien).length - 1

  if (occurrences !== 1) {
    console.log(`[${nom}] TEMOIN ÉCHEC : ${occurrences} occurrence(s) — mutation non appliquée`)
    return false
  }

  writeFileSync(chemin, original.replace(ancien, nouveau), 'utf8')

  // Témoin d'application, lu **avant** le résultat du test.
  const apres = readFileSync(chemin, 'utf8')
  if (apres === original) {
    console.log(`[${nom}] TEMOIN ÉCHEC : fichier inchangé`)
    writeFileSync(chemin, reference, 'utf8')
    return false
  }
  console.log(`[${nom}] TEMOIN OK`)
  for (const ligne of diff(original, apres).slice(0, 6)) console.log(ligne)

  const { sortie } = await lancer(tests)
  writeFileSync(chemin, reference, 'utf8')
  const restaure = readFileSync(chemin, 'utf8') === reference

  // Une restauration ratée n'est pas un résultat de mesure : on s'arrête ici,
  // avant que la mutation suivante ne s'applique à un fichier faux.
  if (!restaure) {
    console.error(`[${nom}] RESTAURATION ÉCHEC — la campagne s'arrête sur cet arbre.`)
    sortir(1)
  }

  const echecs = sortie
    .split('\n')
    .filter((ligne) => ligne.trim().startsWith('✖'))
    .map((ligne) => ligne.trim())
  const bilan = sortie
    .split('\n')
    .filter((ligne) => ligne.startsWith('ℹ pass') || ligne.startsWith('ℹ fail'))
    .map((ligne) => ligne.trim())

  console.log(`  bilan : ${bilan.join(' | ') || 'aucun rapport'}`)
  for (const echec of [...new Set(echecs)].slice(0, 4)) console.log(`  ${echec}`)
  console.log(
    `  restauré : ${restaure ? 'oui' : 'NON'} — ${echecs.length > 0 ? 'MUTATION DÉTECTÉE' : 'MUTATION NON DÉTECTÉE'}`
  )

  return restaure && echecs.length > 0
}

/* ---------------------------------------------------------------------------
   Les mutations. Chacune vise **une** assertion de cette tâche.
   ------------------------------------------------------------------------ */

const ENTREES = [
  {
    nom: 'M1 — `recovery` retiré des types vérifiables',
    fichier: 'web/src/lib/confirmation.mjs',
    // Le code a changé depuis la première rédaction de cette entrée : `recovery`
    // figure désormais en littéral, sous son commentaire. L'ancien motif
    // (`TYPE_RECUPERATION`) ne s'appliquait plus **zéro** fois, et le harnais
    // Refusait alors toute la campagne — c'est exactement ce qu'il doit faire.
    ancien: "  'recovery',\n])\n",
    nouveau: "])\n",
    tests: ['tools/rea/tests/confirmation.test.mjs'],
  },
  {
    nom: 'M2 — la destination ignore le flux',
    fichier: 'web/src/lib/confirmation.mjs',
    ancien: '  return lecture?.flux === FLUX_RECUPERATION ? PAGE_NOUVEAU_MOT_DE_PASSE : DESTINATION_SUCCES',
    nouveau: '  return DESTINATION_SUCCES',
    tests: ['tools/rea/tests/confirmation.test.mjs', 'tools/rea/tests/nouveau-mot-de-passe.test.mjs'],
  },
  {
    nom: 'M3 — la route écrit la destination en dur',
    fichier: 'web/src/app/auth/confirm/route.js',
    ancien: 'redirect(destinationSucces(lecture))',
    nouveau: "redirect('/dashboard')",
    tests: ['tools/rea/tests/confirmation.test.mjs', 'tools/rea/tests/nouveau-mot-de-passe.test.mjs'],
  },
  {
    nom: 'M4 — la demande n’envoie plus de retour',
    fichier: 'web/src/app/(auth)/forgot-password/actions.js',
    ancien: 'resetPasswordForEmail(email, options)',
    nouveau: 'resetPasswordForEmail(email)',
    tests: ['tools/rea/tests/nouveau-mot-de-passe.test.mjs'],
  },
  {
    nom: 'M5 — l’option de retour n’est plus conditionnée',
    fichier: 'web/src/app/(auth)/forgot-password/actions.js',
    ancien: 'const options = redirectTo === null ? {} : { redirectTo }',
    nouveau: 'const options = { redirectTo }',
    tests: ['tools/rea/tests/nouveau-mot-de-passe.test.mjs'],
  },
  {
    nom: 'M6 — l’URL de retour perd son marqueur de flux',
    fichier: 'web/src/lib/confirmation.mjs',
    ancien: 'return base === null ? null : `${base}?${PARAMETRE_FLUX}=${FLUX_RECUPERATION}`',
    nouveau: 'return base',
    tests: ['tools/rea/tests/confirmation.test.mjs', 'tools/rea/tests/nouveau-mot-de-passe.test.mjs'],
  },
  {
    nom: 'M7 — la page cesse de rendre la valeur produite',
    fichier: 'web/src/app/(auth)/nouveau-mot-de-passe/page.jsx',
    ancien: "      {etat === 'session' ? (",
    nouveau: "      {etat === 'sessionExpiree' ? (",
    tests: ['tools/rea/tests/etat-action.test.mjs', 'tools/rea/tests/nouveau-mot-de-passe.test.mjs'],
  },
  {
    nom: 'M8 — l’action change la valeur qu’elle écrit',
    fichier: 'web/src/app/(auth)/nouveau-mot-de-passe/actions.js',
    ancien: "redirect('/nouveau-mot-de-passe?etat=session')",
    nouveau: "redirect('/nouveau-mot-de-passe?etat=expiree')",
    tests: ['tools/rea/tests/etat-action.test.mjs', 'tools/rea/tests/nouveau-mot-de-passe.test.mjs'],
  },
  {
    nom: 'M9 — le producteur passe à un gabarit (ensemble vide, §28.2)',
    fichier: 'web/src/app/(auth)/nouveau-mot-de-passe/actions.js',
    ancien: "  if (erreur) redirect('/nouveau-mot-de-passe?etat=session')",
    nouveau:
      "  const etatSession = 'session'\n  if (erreur) redirect(`/nouveau-mot-de-passe?etat=${etatSession}`)",
    tests: ['tools/rea/tests/nouveau-mot-de-passe.test.mjs'],
  },
  {
    nom: 'M10 — le formulaire renomme un champ envoyé',
    fichier: 'web/src/components/auth/FormulaireNouveauMotDePasse.jsx',
    ancien: '        name="confirmation"',
    nouveau: '        name="confirm"',
    tests: ['tools/rea/tests/nouveau-mot-de-passe.test.mjs'],
  },
  {
    nom: 'M11 — l’action lit un autre nom de champ',
    fichier: 'web/src/app/(auth)/nouveau-mot-de-passe/actions.js',
    ancien: "donnees.get('confirmation')",
    nouveau: "donnees.get('confirm')",
    tests: ['tools/rea/tests/nouveau-mot-de-passe.test.mjs'],
  },
  {
    nom: 'M12 — l’alerte de session devient un état d’écran',
    fichier: 'web/src/app/(auth)/nouveau-mot-de-passe/page.jsx',
    ancien: '          role="alert"',
    nouveau: '          role="status"',
    tests: ['tools/rea/tests/nouveau-mot-de-passe.test.mjs'],
  },
  {
    nom: 'M13 — le formulaire reste affiché sous le message',
    fichier: 'web/src/app/(auth)/nouveau-mot-de-passe/page.jsx',
    ancien: '      ) : (\n        <FormulaireNouveauMotDePasse locale={locale} />\n      )}',
    nouveau: '      ) : null}\n      <FormulaireNouveauMotDePasse locale={locale} />',
    tests: ['tools/rea/tests/nouveau-mot-de-passe.test.mjs'],
  },
  {
    nom: 'M14 — `?echec=` est envoyé vers un écran qui ne le rend pas',
    fichier: 'web/src/lib/confirmation.mjs',
    ancien: "export const CHEMIN_ECHEC = '/forgot-password'",
    nouveau: "export const CHEMIN_ECHEC = '/login'",
    tests: ['tools/rea/tests/nouveau-mot-de-passe.test.mjs'],
  },
  {
    nom: 'M15 — le serveur ne rejoue plus les règles du mot de passe',
    fichier: 'web/src/lib/validation-compte.mjs',
    ancien: '  if (confirmation !== motDePasse || confirmation === \'\') {\n    erreurs.confirmation = \'auth.confirmation.differente\'\n  }',
    nouveau: '',
    tests: ['tools/rea/tests/validation-compte.test.mjs'],
  },
  /* --- 0004 / écran Clients / copie mesurée (2026-10-31) ------------------ */
  {
    nom: 'M16 — la lecture rend une colonne de plus (email)',
    fichier: 'migrations/0004_lecture_cartes.sql',
    ancien: "'card_token',  s.card_token,",
    nouveau: "'card_token',  s.card_token,\n           'email',       'fuite',",
    tests: ['tools/rea/tests/migration-0004.test.mjs'],
  },
  {
    nom: 'M17 — le GRANT rouvre la liste à `anon`',
    fichier: 'migrations/0004_lecture_cartes.sql',
    ancien: 'grant  execute on function public.cartes_du_commerce() to authenticated, service_role;',
    nouveau:
      'grant  execute on function public.cartes_du_commerce() to anon, authenticated, service_role;',
    tests: ['tools/rea/tests/migration-0004.test.mjs'],
  },
  {
    nom: 'M18 — la fonction perd son search_path figé',
    fichier: 'migrations/0004_lecture_cartes.sql',
    ancien: 'security definer\nset search_path = public\nas $fonction$',
    nouveau: 'security definer\nas $fonction$',
    tests: ['tools/rea/tests/migration-0004.test.mjs'],
  },
  {
    nom: 'M19 — « aucune carte » et « je n’ai pas compris » fusionnent',
    fichier: 'web/src/app/(dashboard)/customers/page.jsx',
    ancien: 'liste.cartes.length === 0',
    nouveau: 'liste.cartes.length < 0',
    tests: ['tools/rea/tests/clients-lecture.test.mjs'],
  },
  {
    nom: 'M20 — un libellé mesuré dérive',
    fichier: 'web/src/i18n/dictionnaires.mjs',
    ancien: "'page.clients.colonnePoints': 'Points / Tampons',",
    nouveau: "'page.clients.colonnePoints': 'Points',",
    tests: ['tools/rea/tests/clients-lecture.test.mjs'],
  },
  {
    nom: 'M21 — le formulaire reprend le libellé de l’inscription',
    fichier: 'web/src/components/auth/FormulaireNouveauMotDePasse.jsx',
    ancien: "libelle={t('auth.nouveau.champMotDePasse')}",
    nouveau: "libelle={t('champ.motDePasse')}",
    tests: ['tools/rea/tests/copie-mesuree.test.mjs'],
  },
  {
    nom: 'M22 — l’écran affiche un nom de migration qui n’existe pas',
    fichier: 'web/src/app/(dashboard)/customers/page.jsx',
    ancien: 'commande="migrations/0004_lecture_cartes.sql"',
    nouveau: 'commande="migrations/0005_lecture_cartes.sql"',
    tests: ['tools/rea/tests/clients-lecture.test.mjs'],
  },
  {
    nom: 'M23 — une réponse illisible devient une liste vide',
    fichier: 'web/src/lib/carte.mjs',
    ancien: 'if (!Array.isArray(donnees.cartes)) return null',
    nouveau:
      'if (!Array.isArray(donnees.cartes)) return { total: 0, limite: 0, cartes: [], tronquee: false }',
    tests: ['tools/rea/tests/clients-lecture.test.mjs'],
  },
  {
    nom: 'M24 — la transaction se referme avant de s’ouvrir (faute réellement commise)',
    fichier: 'migrations/0004_lecture_cartes.sql',
    ancien: '\ncommit;',
    nouveau: '\ncommit;\n\nbegin;',
    tests: ['tools/rea/tests/migration-0004.test.mjs'],
  },
  /* --- 0005 / écran d'accueil / copie mesurée (2026-10-31) ---------------- */
  {
    nom: 'M25 — la lecture du tableau rouvre le GRANT à `anon`',
    fichier: 'migrations/0005_lecture_tableau.sql',
    ancien:
      'grant  execute on function public.tableau_du_commerce() to authenticated, service_role;',
    nouveau:
      'grant  execute on function public.tableau_du_commerce() to anon, authenticated, service_role;',
    tests: ['tools/rea/tests/migration-0005.test.mjs'],
  },
  {
    nom: 'M26 — la fonction du tableau perd son search_path figé',
    fichier: 'migrations/0005_lecture_tableau.sql',
    ancien: 'security definer\nset search_path = public\nas $fonction$',
    nouveau: 'security definer\nas $fonction$',
    tests: ['tools/rea/tests/migration-0005.test.mjs'],
  },
  {
    nom: 'M27 — le seuil « au moins 2 visites » dérive à 3',
    fichier: 'migrations/0005_lecture_tableau.sql',
    ancien: 'having count(*) >= 2',
    nouveau: 'having count(*) >= 3',
    tests: ['tools/rea/tests/migration-0005.test.mjs'],
  },
  {
    nom: 'M28 — la fenêtre « 30 derniers jours » des visites dérive à 7',
    fichier: 'migrations/0005_lecture_tableau.sql',
    ancien:
      "   where created_at >= now() - interval '30 days';\n\n  select count(*) into v_cartes",
    nouveau:
      "   where created_at >= now() - interval '7 days';\n\n  select count(*) into v_cartes",
    tests: ['tools/rea/tests/migration-0005.test.mjs'],
  },
  {
    nom: 'M29 — la lecture rend une colonne de plus (email)',
    fichier: 'migrations/0005_lecture_tableau.sql',
    ancien: "'card_token',  s.card_token,",
    nouveau: "'card_token',  s.card_token,\n           'email',       'fuite',",
    tests: ['tools/rea/tests/migration-0005.test.mjs'],
  },
  {
    nom: 'M30 — l’ordre perd sa clé unique (trois lignes, un seul horodatage)',
    fichier: 'migrations/0005_lecture_tableau.sql',
    ancien: 'order by t.created_at desc nulls last, t.id',
    nouveau: 'order by t.created_at desc nulls last',
    tests: ['tools/rea/tests/migration-0005.test.mjs'],
  },
  {
    nom: 'M31 — « Reviennent » affiche 0 % alors qu’aucune carte n’existe',
    fichier: 'web/src/lib/tableau.mjs',
    ancien: '|| cartes <= 0) return null',
    nouveau: '|| cartes <= 0) return 0',
    tests: ['tools/rea/tests/tableau-lecture.test.mjs'],
  },
  {
    nom: 'M32 — un sous-titre mesuré dérive',
    fichier: 'web/src/i18n/dictionnaires.mjs',
    ancien: "'tableau.sous.deuxVisites': 'au moins 2 visites',",
    nouveau: "'tableau.sous.deuxVisites': '2 visites ou plus',",
    tests: ['tools/rea/tests/tableau-lecture.test.mjs'],
  },
  {
    nom: 'M33 — le symbole monétaire de la cible est recopié',
    fichier: 'web/src/i18n/dictionnaires.mjs',
    ancien: "'tableau.indicateur.ca': 'CA ({devise})',",
    nouveau: "'tableau.indicateur.ca': 'CA (€)',",
    tests: ['tools/rea/tests/tableau-lecture.test.mjs'],
  },
  {
    nom: 'M34 — la page ne départage plus « illisible » et « aucune activité »',
    fichier: 'web/src/app/(dashboard)/dashboard/page.jsx',
    ancien:
      "const etat = lecture.etat === 'ok' && tableau === null ? 'illisible' : lecture.etat",
    nouveau: 'const etat = lecture.etat',
    tests: ['tools/rea/tests/tableau-lecture.test.mjs'],
  },
  {
    nom: 'M35 — l’écran affiche un nom de migration qui existe mais ne porte pas la fonction',
    fichier: 'web/src/components/tableau/ContenuTableau.jsx',
    ancien: 'commande="migrations/0005_lecture_tableau.sql"',
    nouveau: 'commande="migrations/0006_equipe_et_designation.sql"',
    tests: ['tools/rea/tests/tableau-lecture.test.mjs'],
  },
  {
    nom: 'M36 — le rendu non branché affiche « 0 » au lieu du tiret',
    fichier: 'web/src/components/tableau/ContenuTableau.jsx',
    ancien:
      'return INDICATEURS.map((cle) => ({ cle, valeur: VIDE, sous: null, sousParams: {} }))',
    nouveau:
      "return INDICATEURS.map((cle) => ({ cle, valeur: '0', sous: null, sousParams: {} }))",
    tests: ['tools/rea/tests/tableau-lecture.test.mjs'],
  },
  /* --- 0006 / modèle d'équipe et désignation (2026-10-31) ------------------ */
  {
    nom: 'M37 — supprimer une caisse supprime les clients qui l’ont désignée',
    fichier: 'migrations/0006_equipe_et_designation.sql',
    ancien: '      on delete set null;',
    nouveau: '      on delete cascade;',
    tests: ['tools/rea/tests/migration-0006.test.mjs'],
  },
  {
    nom: 'M38 — supprimer une caisse retire ses scans du chiffre d’affaires',
    fichier: 'migrations/0006_equipe_et_designation.sql',
    ancien: '      on delete restrict;',
    nouveau: '      on delete cascade;',
    tests: ['tools/rea/tests/migration-0006.test.mjs'],
  },
  {
    nom: 'M39 — la RLS de l’équipe est désactivée',
    fichier: 'migrations/0006_equipe_et_designation.sql',
    ancien: 'alter table public.staff enable row level security;',
    nouveau: 'alter table public.staff disable row level security;',
    tests: ['tools/rea/tests/migration-0006.test.mjs'],
  },
  {
    nom: 'M40 — la liste nominative de l’équipe est rendue à `authenticated`',
    fichier: 'migrations/0006_equipe_et_designation.sql',
    ancien: 'grant  select, insert, update, delete on table public.staff to service_role;',
    nouveau: 'grant  select on table public.staff to authenticated;',
    tests: ['tools/rea/tests/migration-0006.test.mjs'],
  },
  {
    nom: 'M41 — la désignation est posée sur la carte, pas sur le client',
    fichier: 'migrations/0006_equipe_et_designation.sql',
    ancien:
      'alter table public.clients\n  add column if not exists designated_staff_id uuid;',
    nouveau:
      'alter table public.loyalty_cards\n  add column if not exists designated_staff_id uuid;',
    tests: ['tools/rea/tests/migration-0006.test.mjs'],
  },
  {
    nom: 'M42 — un rôle que l’écran ne sait pas afficher apparaît',
    fichier: 'migrations/0006_equipe_et_designation.sql',
    ancien: "constraint staff_role_check check (role in ('caisse', 'responsable')),",
    nouveau: "constraint staff_role_check check (role in ('caisse', 'owner')),",
    tests: ['tools/rea/tests/migration-0006.test.mjs'],
  },
  {
    nom: 'M43 — la table n’est plus créée sous garde (le second passage lève)',
    fichier: 'migrations/0006_equipe_et_designation.sql',
    ancien: 'create table if not exists public.staff (',
    nouveau: 'create table public.staff (',
    tests: ['tools/rea/tests/migration-0006.test.mjs'],
  },
  {
    nom: 'M44 — la migration de schéma sème une caisse que personne n’a créée',
    fichier: 'migrations/0006_equipe_et_designation.sql',
    ancien: '$garde$;\n\ncommit;',
    nouveau: "$garde$;\n\ninsert into public.staff (first_name) values ('Amina');\n\ncommit;",
    tests: ['tools/rea/tests/migration-0006.test.mjs'],
  },
  {
    nom: 'M45 — la désignation devient obligatoire : plus aucune inscription anonyme',
    fichier: 'migrations/0006_equipe_et_designation.sql',
    ancien: '  add column if not exists designated_staff_id uuid;',
    nouveau: '  add column if not exists designated_staff_id uuid not null;',
    tests: ['tools/rea/tests/migration-0006.test.mjs'],
  },
  {
    nom: 'M46 — la clé étrangère de l’audit ne pointe plus sur l’équipe',
    fichier: 'migrations/0006_equipe_et_designation.sql',
    ancien:
      '      foreign key (staff_id) references public.staff(id)\n      on delete restrict;',
    nouveau:
      '      foreign key (staff_id) references public.clients(id)\n      on delete restrict;',
    tests: ['tools/rea/tests/migration-0006.test.mjs'],
  },
  {
    nom: 'M47 — l’index ne sert plus le comptage par caissier désigné',
    fichier: 'migrations/0006_equipe_et_designation.sql',
    ancien: '  on public.clients (designated_staff_id);',
    nouveau: '  on public.clients (first_name);',
    tests: ['tools/rea/tests/migration-0006.test.mjs'],
  },
  {
    nom: 'M48 — une caisse ne peut plus être désactivée (colonne `active` perdue)',
    fichier: 'migrations/0006_equipe_et_designation.sql',
    ancien: '  active     boolean     not null default true,',
    nouveau: '  active     boolean,',
    tests: ['tools/rea/tests/migration-0006.test.mjs'],
  },
  {
    nom: 'M49 — une caisse peut porter un prénom vide',
    fichier: 'migrations/0006_equipe_et_designation.sql',
    ancien:
      "  constraint staff_role_check check (role in ('caisse', 'responsable')),\n  constraint staff_first_name_check check (length(btrim(first_name)) between 1 and 80)",
    nouveau: "  constraint staff_role_check check (role in ('caisse', 'responsable'))",
    tests: ['tools/rea/tests/migration-0006.test.mjs'],
  },
  /* --- 0007 / désignation et lecture de l'équipe (2026-10-31) --------------- */
  {
    nom: 'M50 — « Cartes » compte des cartes au lieu de clients désignés',
    fichier: 'migrations/0007_equipe_lecture.sql',
    ancien: '      from public.clients c',
    nouveau: '      from public.loyalty_cards c',
    tests: ['tools/rea/tests/migration-0007.test.mjs'],
  },
  {
    nom: 'M51 — « Avis » affiche 0 au lieu d’une absence déclarée',
    fichier: 'migrations/0007_equipe_lecture.sql',
    ancien: 'null::integer      as avis',
    nouveau: '0::integer         as avis',
    tests: ['tools/rea/tests/migration-0007.test.mjs'],
  },
  {
    nom: 'M52 — la ligne du titulaire disparaît du classement',
    fichier: 'migrations/0007_equipe_lecture.sql',
    ancien: '    union all\n    select null::uuid, null::varchar, null::varchar, true\n  ),',
    nouveau: '  ),',
    tests: ['tools/rea/tests/migration-0007.test.mjs'],
  },
  {
    nom: 'M53 — la fenêtre de 30 jours devient 90 jours (le sous-titre ment)',
    fichier: 'migrations/0007_equipe_lecture.sql',
    ancien: "v_debut := v_fin - interval '30 days';",
    nouveau: "v_debut := v_fin - interval '90 days';",
    tests: ['tools/rea/tests/migration-0007.test.mjs'],
  },
  {
    nom: 'M54 — une cinquième période est acceptée sans définition',
    fichier: 'migrations/0007_equipe_lecture.sql',
    ancien: "not in ('7j', '30j', 'depuis_le_debut', 'jour')",
    nouveau: "not in ('7j', '30j', 'depuis_le_debut', 'jour', 'mois')",
    tests: ['tools/rea/tests/migration-0007.test.mjs'],
  },
  {
    nom: 'M55 — la surcharge à un argument n’est plus retirée (appel ambigu)',
    fichier: 'migrations/0007_equipe_lecture.sql',
    ancien: 'drop function if exists public.join_loyalty_program(varchar);',
    nouveau: 'drop function if exists public.join_loyalty_program(uuid);',
    tests: ['tools/rea/tests/migration-0007.test.mjs'],
  },
  {
    nom: 'M56 — la désignation n’est plus écrite avec le client',
    fichier: 'migrations/0007_equipe_lecture.sql',
    ancien:
      '  insert into public.clients (first_name, last_name, email, designated_staff_id)\n  values (null, null, null, p_staff_id)',
    nouveau: '  insert into public.clients (first_name, last_name, email)\n  values (null, null, null)',
    tests: ['tools/rea/tests/migration-0007.test.mjs'],
  },
  {
    nom: 'M57 — une caisse inconnue est avalée au lieu d’être refusée',
    fichier: 'migrations/0007_equipe_lecture.sql',
    ancien: "    raise exception 'STAFF_NOT_FOUND' using errcode = 'P0001';",
    nouveau: '    null;',
    tests: ['tools/rea/tests/migration-0007.test.mjs'],
  },
  {
    nom: 'M58 — `anon` n’est plus révoqué du classement (prénoms + CA)',
    fichier: 'migrations/0007_equipe_lecture.sql',
    ancien:
      'revoke execute on function public.equipe_du_commerce(varchar, date, varchar) from public, anon, authenticated;',
    nouveau:
      'revoke execute on function public.equipe_du_commerce(varchar, date, varchar) from public, authenticated;',
    tests: ['tools/rea/tests/migration-0007.test.mjs'],
  },
  {
    nom: 'M59 — un libellé d’affichage entre dans le SQL',
    fichier: 'migrations/0007_equipe_lecture.sql',
    ancien: "'prenom',   l.prenom,",
    nouveau: "'prenom',   coalesce(l.prenom, 'Titulaire'),",
    tests: ['tools/rea/tests/migration-0007.test.mjs'],
  },
  {
    nom: 'M60 — « un jour précis » n’applique plus le fuseau déclaré',
    fichier: 'migrations/0007_equipe_lecture.sql',
    ancien: 'v_debut := (p_jour::timestamp) at time zone v_fuseau;',
    nouveau: 'v_debut := (p_jour::timestamp);',
    tests: ['tools/rea/tests/migration-0007.test.mjs'],
  },
  {
    nom: 'M61 — l’ordre du classement n’est plus total',
    fichier: 'migrations/0007_equipe_lecture.sql',
    ancien: "l.staff_id asc), '[]'::json)",
    nouveau: "l.prenom asc), '[]'::json)",
    tests: ['tools/rea/tests/migration-0007.test.mjs'],
  },
  {
    nom: 'M62 — la migration sème une caisse hors de toute fonction',
    fichier: 'migrations/0007_equipe_lecture.sql',
    ancien: 'commit;',
    nouveau: "insert into public.staff (first_name) values ('Amina');\n\ncommit;",
    tests: ['tools/rea/tests/migration-0007.test.mjs'],
  },
  {
    nom: 'M63 — le titulaire perd ses agrégats (jointure `=` sur un `null`)',
    fichier: 'migrations/0007_equipe_lecture.sql',
    ancien: 'left join scans  s on s.staff_id is not distinct from k.staff_id',
    nouveau: 'left join scans  s on s.staff_id = k.staff_id',
    tests: ['tools/rea/tests/migration-0007.test.mjs'],
  },
  {
    nom: 'M64 — `anon` perd l’inscription publique (page d’adhésion)',
    fichier: 'migrations/0007_equipe_lecture.sql',
    ancien:
      'grant  execute on function public.join_loyalty_program(varchar, uuid) to anon, authenticated, service_role;',
    nouveau:
      'grant  execute on function public.join_loyalty_program(varchar, uuid) to service_role;',
    tests: ['tools/rea/tests/migration-0007.test.mjs'],
  },
  {
    nom: 'M65 — le taux passe de `numeric(10,2)` à `numeric(10,0)` (1,5 arrondi à 2)',
    fichier: 'migrations/0008_credits_par_euro.sql',
    ancien: 'credits_par_euro numeric(10, 2) not null default 1',
    nouveau: 'credits_par_euro numeric(10, 0) not null default 1',
    tests: ['tools/rea/tests/migration-0008.test.mjs'],
  },
  {
    nom: 'M66 — le `update` de devise perd son `where` (toute devise convertie de force)',
    fichier: 'migrations/0008_credits_par_euro.sql',
    ancien: "set devise = 'EUR' where devise = 'MAD';",
    nouveau: "set devise = 'EUR';",
    tests: ['tools/rea/tests/migration-0008.test.mjs'],
  },
  {
    nom: 'M67 — `create or replace` sans le `drop` de la signature à cinq arguments',
    fichier: 'migrations/0008_credits_par_euro.sql',
    ancien:
      'drop function if exists public.enregistrer_programme(varchar, varchar, integer, varchar, jsonb);',
    nouveau: '-- (drop retiré)',
    tests: ['tools/rea/tests/migration-0008.test.mjs'],
  },
  {
    nom: 'M68 — `anon` n’est plus révoqué du programme (réécriture des paliers)',
    fichier: 'migrations/0008_credits_par_euro.sql',
    ancien: 'from public, anon, authenticated;',
    nouveau: 'from public, authenticated;',
    tests: ['tools/rea/tests/migration-0008.test.mjs'],
  },
  {
    nom: 'M69 — les points sont tronqués au lieu d’être arrondis (un point perdu par vente)',
    fichier: 'web/src/lib/programme.mjs',
    ancien: 'return Math.max(0, Math.round(montant * creditsParEuro))',
    nouveau: 'return Math.max(0, Math.trunc(montant * creditsParEuro))',
    tests: ['tools/rea/tests/modules.test.mjs'],
  },
  {
    nom: 'M70 — la caméra accepte n’importe quelle destination (redirecteur ouvert)',
    fichier: 'web/src/lib/camera.mjs',
    ancien: "if (!DESTINATIONS_CARTE.includes(base)) return ''",
    nouveau: "if (typeof base !== 'string') return ''",
    tests: ['tools/rea/tests/scan-camera.test.mjs'],
  },
  {
    nom: 'M71 — la caméra de la caisse renvoie sur `/scan` (destination ignorée)',
    fichier: 'web/src/components/scan/CameraScanner.jsx',
    ancien: 'cheminCarte(code, destination)',
    nouveau: 'cheminCarte(code)',
    tests: ['tools/rea/tests/scan-camera.test.mjs'],
  },
  {
    nom: 'M72 — le symbole de l’euro n’est plus qu’un code (`EUR` affiché tel quel)',
    fichier: 'web/src/lib/tableau.mjs',
    ancien: "const SYMBOLES = { EUR: '€', USD: '$', GBP: '£' }",
    nouveau: "const SYMBOLES = { USD: '$', GBP: '£' }",
    tests: ['tools/rea/tests/tableau-lecture.test.mjs'],
  },
  {
    nom: 'M73 — l’écran Programme n’envoie plus le taux (champ renommé)',
    fichier: 'web/src/app/(dashboard)/rewards/page.jsx',
    ancien: 'name="credits"',
    nouveau: 'name="taux"',
    tests: ['tools/rea/tests/taux-conversion.test.mjs'],
  },
  {
    nom: 'M74 — la caisse ne coche plus le premier palier atteignable',
    fichier: 'web/src/app/(dashboard)/caisse/page.jsx',
    ancien: 'defaultChecked={dispo && palier.cout === offrables[0].cout}',
    nouveau: 'defaultChecked={dispo}',
    tests: ['tools/rea/tests/taux-conversion.test.mjs'],
  },
  {
    nom: 'M75 — le squelette ne s’annonce plus (écran mort pour un lecteur d’écran)',
    fichier: 'web/src/app/(dashboard)/loading.jsx',
    ancien: '<div className="uc-squelette" role="status" aria-live="polite" aria-busy="true">',
    nouveau:
      '<div className="uc-squelette" role="presentation" aria-live="polite" aria-busy="true">',
    tests: ['tools/rea/tests/latence.test.mjs'],
  },
  {
    nom: 'M76 — la mémoire courte accepte aussi les pannes (`indisponible` figé 10 s)',
    fichier: 'web/src/lib/donnees.mjs',
    ancien: 'cacheProgramme.ecrire(resultat)',
    nouveau: 'cacheProgramme.ecrire(r)',
    tests: ['tools/rea/tests/latence.test.mjs'],
  },
  {
    nom: 'M77 — enregistrer n’invalide plus : l’écran relit sa propre valeur périmée',
    fichier: 'web/src/lib/donnees.mjs',
    ancien: "if (resultat.etat === 'ok') cacheProgramme.oublier()",
    nouveau: 'if (false) cacheProgramme.oublier()',
    tests: ['tools/rea/tests/latence.test.mjs'],
  },
  {
    nom: 'M78 — /scan repasse en `allSettled` (réponses enveloppées, carte jamais affichée)',
    fichier: 'web/src/app/(dashboard)/scan/page.jsx',
    ancien: 'const [carte, programme] = await Promise.all([',
    nouveau: 'const [carte, programme] = await Promise.allSettled([',
    tests: ['tools/rea/tests/latence.test.mjs'],
  },
  {
    nom: 'M79 — la caisse lit le barème mémorisé au lieu de la base',
    fichier: 'web/src/app/(dashboard)/scan/actions.js',
    ancien: 'programmeDuCommerce({ frais: true })',
    nouveau: 'programmeDuCommerce()',
    tests: ['tools/rea/tests/taux-conversion.test.mjs'],
  },
  {
    nom: 'M80 — la grille de /caisse est posée sans seconde colonne',
    fichier: 'web/src/app/(dashboard)/caisse/page.jsx',
    ancien: "className={lisible ? 'uc-grille' : undefined}",
    nouveau: 'className="uc-grille"',
    tests: ['tools/rea/tests/design-ecrans.test.mjs'],
  },
  {
    nom: 'M81 — la jauge reprend la piste invisible de la palette « verre »',
    fichier: 'web/src/components/tableau/JaugePoints.jsx',
    ancien: 'className="uc-jauge"',
    nouveau: 'className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10"',
    tests: ['tools/rea/tests/design-ecrans.test.mjs'],
  },
  {
    nom: 'M82 — l’affiche du QR perd son cadre blanc (plus rien à imprimer)',
    fichier: 'web/src/app/(dashboard)/qrcode/page.jsx',
    ancien: 'className="uc-affiche mt-4"',
    nouveau: 'className="mt-4"',
    tests: ['tools/rea/tests/design-ecrans.test.mjs'],
  },
  {
    nom: 'M83 — le bas de page ignore la zone sûre (dernier bouton sous la barre)',
    fichier: 'web/src/styles/unicity.css',
    ancien: 'padding: 16px 16px calc(96px + env(safe-area-inset-bottom));',
    nouveau: 'padding: 16px 16px 96px;',
    tests: ['tools/rea/tests/design-ecrans.test.mjs'],
  },
  {
    nom: 'M84 — le délai de 300 ms du double-tap revient sur chaque lien',
    fichier: 'web/src/styles/unicity.css',
    ancien: '  touch-action: manipulation;',
    nouveau: '  touch-action: auto;',
    tests: ['tools/rea/tests/design-ecrans.test.mjs'],
  },
  {
    nom: 'M85 — le trophée remplace le rang annoncé (l’icône seule ne dit rien)',
    fichier: 'web/src/app/(dashboard)/caisses/page.jsx',
    ancien: '<span className="uc-sr">',
    nouveau: '<span className="uc-muet">',
    tests: ['tools/rea/tests/caisses-lecture.test.mjs'],
  },
  {
    nom: 'M86 — l’écran retrie le classement que la fonction avait ordonné',
    fichier: 'web/src/app/(dashboard)/caisses/page.jsx',
    ancien: '{equipe.lignes.map((ligne) => (',
    nouveau:
      '{[...equipe.lignes].sort((a, b) => b.points - a.points).map((ligne) => (',
    tests: ['tools/rea/tests/caisses-lecture.test.mjs'],
  },
  {
    nom: 'M87 — `p_jour` part toujours (le défaut de la fonction n’est plus utilisé)',
    fichier: 'web/src/lib/donnees.mjs',
    ancien: 'if (jour) args.p_jour = jour',
    nouveau: 'args.p_jour = jour',
    tests: ['tools/rea/tests/caisses-lecture.test.mjs'],
  },
  {
    nom: 'M88 — `PERIODE_INCONNUE` n’est plus un refus : une faute d’URL devient une panne',
    fichier: 'web/src/lib/donnees.mjs',
    ancien: "'PERIODE_INCONNUE',",
    nouveau: "'PERIODE_INCONNUE_XX',",
    tests: ['tools/rea/tests/caisses-lecture.test.mjs'],
  },
  {
    nom: 'M89 — « Avis » absent s’affiche « 0 » (le fait inventé que `0007` refuse)',
    fichier: 'web/src/lib/equipe.mjs',
    ancien: 'avis: avis === null ? null : formaterNombre(avis),',
    nouveau: 'avis: avis === null ? formaterNombre(0) : formaterNombre(avis),',
    tests: ['tools/rea/tests/caisses-lecture.test.mjs'],
  },
  {
    nom: 'M90 — une absence d’avis non déclarée passe (tiret muet à l’écran)',
    fichier: 'web/src/lib/equipe.mjs',
    ancien: "if (avisAbsent && !absences.includes('avis')) return null",
    nouveau: 'if (false) return null',
    tests: ['tools/rea/tests/caisses-lecture.test.mjs'],
  },
  /* --- Le choix de la caisse sur `/join/<slug>` (`0009`, 2026-11-01) ------- */

  {
    nom: 'M91 — l’inscription n’envoie plus la caisse (le zéro exact et inutile revient)',
    fichier: 'web/src/lib/donnees.mjs',
    ancien: '  if (caisse) args.p_staff_id = caisse',
    nouveau: '  void caisse',
    tests: ['tools/rea/tests/adhesion-caisse.test.mjs'],
  },
  {
    nom: 'M92 — `STAFF_NOT_FOUND` n’est plus un refus : une caisse partie devient une panne',
    fichier: 'web/src/lib/donnees.mjs',
    ancien: "  'STAFF_NOT_FOUND',",
    nouveau: "  'STAFF_NOT_FOUND_XX',",
    tests: ['tools/rea/tests/adhesion-caisse.test.mjs'],
  },
  {
    nom: 'M93 — une caisse sans prénom est affichée (bouton vide, invisible au clic)',
    fichier: 'web/src/lib/adhesion.mjs',
    ancien:
      "    if (typeof brute.prenom !== 'string' || brute.prenom.trim() === '') return null",
    nouveau: '    if (false) return null',
    tests: ['tools/rea/tests/adhesion-caisse.test.mjs'],
  },
  {
    nom: 'M94 — deux boutons pour la même caisse passent (clé de liste dupliquée)',
    fichier: 'web/src/lib/adhesion.mjs',
    ancien: '    if (vues.has(id)) return null',
    nouveau: '    if (false) return null',
    tests: ['tools/rea/tests/adhesion-caisse.test.mjs'],
  },
  {
    nom: 'M95 — recliquer sur la caisse choisie ne la retire plus (renoncement impossible)',
    fichier: 'web/src/lib/adhesion.mjs',
    ancien: '  return courante === id ? null : (id ?? null)',
    nouveau: '  return id ?? null',
    tests: ['tools/rea/tests/adhesion-caisse.test.mjs'],
  },
  {
    nom: 'M96 — une caisse jamais affichée est envoyée telle quelle (formulaire falsifié)',
    fichier: 'web/src/lib/adhesion.mjs',
    ancien: '  return trouvee ? trouvee.id : null',
    nouveau: '  return trouvee ? trouvee.id : demandee',
    tests: ['tools/rea/tests/adhesion-caisse.test.mjs'],
  },
  {
    nom: 'M97 — n’importe quel refus rejoue l’inscription (panne affichée après un succès)',
    fichier: 'web/src/lib/adhesion.mjs',
    ancien: "  return resultat?.etat === 'refuse' && resultat?.code === 'STAFF_NOT_FOUND'",
    nouveau: "  return resultat?.etat === 'refuse'",
    tests: ['tools/rea/tests/adhesion-caisse.test.mjs'],
  },
  {
    nom: 'M98 — le champ s’affiche même sans aucune caisse (groupe vide inventé)',
    fichier: 'web/src/app/join/[slug]/page.jsx',
    ancien: '  const proposerCaisses = Array.isArray(caisses) && caisses.length > 0',
    nouveau: '  const proposerCaisses = true',
    tests: ['tools/rea/tests/adhesion-caisse.test.mjs'],
  },
  {
    nom: 'M99 — la désignation perdue n’est plus dite sur l’URL de succès',
    fichier: 'web/src/app/join/[slug]/actions.js',
    ancien: '        ? `/join/${slug}?carte=${code}&sansDesignation=1`',
    nouveau: '        ? `/join/${slug}?carte=${code}`',
    tests: ['tools/rea/tests/adhesion-caisse.test.mjs'],
  },
  {
    nom: 'M100 — `anon` ne peut plus lire les caisses (la page publique retombe sur zéro)',
    fichier: 'migrations/0009_caisses_publiques.sql',
    ancien:
      'grant  execute on function public.caisses_publiques(varchar) to anon, authenticated, service_role;',
    nouveau:
      'grant  execute on function public.caisses_publiques(varchar) to authenticated, service_role;',
    tests: ['tools/rea/tests/migration-0009.test.mjs'],
  },
  {
    nom: 'M101 — une caisse désactivée reste proposée au client (il désigne un absent)',
    fichier: 'migrations/0009_caisses_publiques.sql',
    ancien: '   where s.active;',
    nouveau: '   where true;',
    tests: ['tools/rea/tests/migration-0009.test.mjs'],
  },
  {
    nom: 'M102 — la fonction publique rend le rôle (le classement s’ouvre à `anon`)',
    fichier: 'migrations/0009_caisses_publiques.sql',
    ancien: "           'prenom', s.first_name",
    nouveau: "           'role', s.role,\n           'prenom', s.first_name",
    tests: ['tools/rea/tests/migration-0009.test.mjs'],
  },
  {
    nom: 'M103 — l’état pressé n’est plus annoncé (le choix n’existe que par la couleur)',
    fichier: 'web/src/components/adhesion/ChoixCaisse.jsx',
    ancien: '            aria-pressed={choisie === caisse.id}',
    nouveau: '            aria-pressed={false}',
    tests: ['tools/rea/tests/adhesion-caisse.test.mjs'],
  },

]

/* ---------------------------------------------------------------------------
   Le démarrage : refuser un arbre sale, puis prendre le marqueur
--------------------------------------------------------------------------- */

if (existsSync(MARQUEUR)) {
  console.log('ARRÊT — une campagne précédente n’a pas terminé proprement :')
  console.log(`  marqueur : ${MARQUEUR}`)
  try {
    const etat = JSON.parse(readFileSync(MARQUEUR, 'utf8'))
    console.log(`  démarrée le : ${etat.demarre ?? 'inconnu'}`)
    for (const fichier of etat.fichiers ?? []) console.log(`  à vérifier : ${fichier}`)
  } catch {
    console.log('  (marqueur illisible — l’état de l’arbre n’est pas établi)')
  }
  console.log('Ces fichiers peuvent porter une mutation. Compare-les (`git diff`), restaure-les, puis :')
  console.log(`  rm "${MARQUEUR}"`)
  console.log('Aucune mesure n’a été prise : un arbre sale ne prouve rien (§27.4).')
  process.exit(1)
}

const manquants = chargerSnapshot(ENTREES)
const ecarts = [...manquants, ...verifierArbre(ENTREES)]
if (ecarts.length > 0) {
  console.log('ARRÊT — l’arbre n’est pas celui qu’annoncent les mutations :')
  for (const ecart of ecarts) console.log('  ' + ecart)
  console.log('Aucune mesure n’a été prise : une mutation qui ne s’applique pas ne prouve rien (§27.4).')
  process.exit(1)
}

// À partir d'ici, l'arbre est connu : le marqueur dit qu'une mort brutale
// laisse des fichiers qu'il faudra relire avant la prochaine mesure.
writeFileSync(
  MARQUEUR,
  JSON.stringify({ demarre: new Date().toISOString(), fichiers: [...SNAPSHOT.keys()] }, null, 2),
  'utf8'
)

const resultats = []
for (const entree of ENTREES) resultats.push(await muter(entree))

console.log()
const detectees = resultats.filter(Boolean).length
console.log(`${detectees}/${resultats.length} mutations détectées`)

// La restauration compte dans le verdict : un arbre rendu sale rend la mesure
// inutilisable, même si chaque mutation a été détectée.
const restes = ecartsDeRestauration()
if (restes.length > 0) {
  console.error('ARRÊT — l’arbre n’est pas revenu à son état de départ :')
  for (const reste of restes) console.error('  ' + reste)
}

sortir(detectees === resultats.length && restes.length === 0 ? 0 : 1)

