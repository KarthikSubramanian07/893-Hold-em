// Runs before the page paints: tells the CSS that JavaScript is here, so the
// plain-text front page (for crawlers and no-JS readers) stays hidden behind
// the app. A file, not inline, because the CSP forbids inline scripts.
document.documentElement.classList.add('js');
