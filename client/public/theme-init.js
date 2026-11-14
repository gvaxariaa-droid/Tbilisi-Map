// Apply the saved theme and language before the first paint (no flash of the wrong theme).
try {
  if (localStorage.getItem('tpm.theme') === 'dark') document.documentElement.classList.add('dark');
  var lang = localStorage.getItem('tpm.lang');
  if (lang === 'ka' || lang === 'en') document.documentElement.lang = lang;
} catch (e) {
  /* storage unavailable: light theme, English */
}
