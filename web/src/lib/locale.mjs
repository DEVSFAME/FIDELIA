/* ============================================================================
   Locale de la requête — la seule colle entre `next/headers` et l'i18n pur.

   Pourquoi ce fichier existe : `src/i18n/*` est délibérément **sans Next**
   (testable par `node --test`, sans build). `headers()` ne l'est pas. Tout ce
   qui touche à la requête tient donc ici, et rien d'autre : la décision, elle,
   reste dans `negocierLocale` (déjà testée, `q=` compris).

   Pourquoi `Accept-Language` et pas un segment d'URL : la locale par défaut
   (`fr`) n'a **pas** de préfixe sur la cible — `/`, `/login`, `/dashboard`. Un
   `app/[locale]` réécrirait toutes les routes mesurées ; ce n'est pas R1. On
   négocie donc ce que le navigateur déclare, et le `div[lang][dir]` porte la
   langue, exactement la structure relevée sur `/ar` (`locales.mjs`).

   Le `catch` n'est pas de la timidité : `headers()` lève hors contexte de
   requête (rendu statique, test unitaire). Sans lui, la page ne rend pas du
   tout ; avec lui, elle rend en français — la locale mesurée.
   ========================================================================== */

import { headers } from 'next/headers'
import { LOCALE_PAR_DEFAUT, localeSure } from '@/i18n/locales.mjs'
import { negocierLocale } from '@/i18n/routage.mjs'

/**
 * Locale de la requête courante, sûre (mesurée) et jamais `undefined`.
 * @returns {Promise<string>}
 */
export async function localeRequete() {
  try {
    const entetes = await headers()
    return localeSure(negocierLocale(entetes.get('accept-language') ?? '', LOCALE_PAR_DEFAUT))
  } catch {
    return LOCALE_PAR_DEFAUT
  }
}
