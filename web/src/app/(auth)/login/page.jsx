import Link from 'next/link'
import { Surface } from '@/components/verre/Surface'
import { FormulaireConnexion } from '@/components/auth/FormulaireConnexion'
import { pour } from '@/i18n/index.mjs'
import { localeRequete } from '@/lib/locale.mjs'
import { messageEtat } from '@/lib/connexion.mjs'

/* Copie **mesurée** : la cible sert « BON / RETOUR » sur deux lignes
   (`font-impact text-5xl uppercase leading-[0.9]`), puis « Connectez-vous à
   votre espace commerçant ». La version précédente disait « Bon retour. » en
   script et « Connexion » en titre — agréable, mais ce n'était pas la cible.
   Source : `_next_static_chunks_app__auth__login_page-fdb96a58c9171993.js`. */

/* `?etat=` est lu **côté serveur** (`searchParams`), comme `?echec=` sur
   `/forgot-password` : le bandeau s'affiche sans JavaScript, et la valeur passe
   par `messageEtat()`. Sur **cette** page, la garde du tableau de bord est le
   seul producteur connu (`/login?etat=configuration`) ; avant ce branchement,
   elle redirigeait vers un message que personne n'affichait. L'ancienneté de ce
   défaut ne le rendait pas invisible : `tools/rea/tests/etat-connexion.test.mjs`
   lit désormais le littéral produit dans le fichier de la garde. Les deux autres
   producteurs du **même mot** (`/scan`, `/caisse`) visent leurs propres URL :
   fermés le même jour, mais avec **leur** copie (`tableau.etat.configuration` —
   elle dit que le geste n'a rien écrit) et **leur** rôle (`alert`, parce que le
   message répond à une soumission, là où celui-ci est là au chargement). Le
   couplage de ces deux écrans est lu par `etat-action.test.mjs`. */

export async function generateMetadata() {
  const { t } = pour(await localeRequete())
  return { title: t('auth.connexion.metaTitre') }
}

export default async function PageConnexion({ searchParams }) {
  const parametres = await searchParams
  const locale = await localeRequete()
  const { t } = pour(locale)
  const etatEcran = messageEtat(parametres?.etat)

  return (
    <Surface variante="verre" className="w-full max-w-sm rounded-[2rem] p-7 shadow-float sm:p-8">
      <div className="mb-8">
        <h1 className="font-impact text-5xl uppercase leading-[0.9] tracking-tight text-ink">
          {t('auth.connexion.titreLigne1')}
          <br />
          {t('auth.connexion.titreLigne2')}
        </h1>
        <p className="mt-3 text-sm font-medium text-ink/55">{t('auth.connexion.sousTitre')}</p>
      </div>

      <FormulaireConnexion locale={locale} etatEcran={etatEcran} />

      <p className="pt-1 text-center text-sm text-ink/50">
        {t('auth.connexion.pied')}{' '}
        {/* Lien vers `/register` : la route est livrée avec cette tâche. Un lien
            vers une route absente a déjà été livré une fois (404 au clic) — le
            test `i18n-ui` vérifie désormais que chaque `href` interne existe. */}
        <Link
          href="/register"
          className="font-bold text-ink underline underline-offset-4 transition-colors hover:text-coral"
        >
          {t('navigation.creerCompte')}
        </Link>
      </p>
    </Surface>
  )
}
