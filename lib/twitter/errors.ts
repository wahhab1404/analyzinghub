/**
 * Map raw X (Twitter) API error strings to clear, user-facing bilingual
 * messages. The raw error is still logged to social_posts for diagnostics;
 * this only affects what the analyst sees in the UI toast.
 */
export function friendlyTwitterError(raw: string): string {
  const e = (raw || '').toLowerCase()

  if (e.includes('creditsdepleted') || e.includes('usage-capped') || e.includes('usage cap')) {
    return 'نَفِد رصيد النشر على X لباقتك الحالية — رقِّ الباقة (Basic) أو انتظر التجديد الشهري. (X posting quota depleted: upgrade your plan or wait for the monthly reset.)'
  }
  if (e.includes('too many requests') || e.includes('rate limit') || e.includes('429')) {
    return 'تجاوزت حد المعدّل المؤقت على X — حاول مرة أخرى بعد قليل. (Rate limit reached, try again shortly.)'
  }
  if (e.includes('duplicate') || e.includes('187')) {
    return 'هذه التغريدة منشورة مسبقًا على X. (This content was already posted to X.)'
  }
  if (e.includes('401') || e.includes('unauthorized') || e.includes('token')) {
    return 'انتهت صلاحية ربط X — أعد ربط حسابك من الإعدادات. (X authorization expired; please reconnect your account.)'
  }
  if (e.includes('403') || e.includes('forbidden')) {
    return 'رفض X النشر (صلاحيات غير كافية) — تأكد أن صلاحيات التطبيق "Read and write". (X refused the post; ensure the app has Read and write permissions.)'
  }
  if (e.includes('duplicate content')) {
    return 'لا يمكن نشر تغريدة مكرّرة على X. (X does not allow posting duplicate content.)'
  }
  return raw
}
