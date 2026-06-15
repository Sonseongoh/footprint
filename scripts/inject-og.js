/**
 * Injects Open Graph / Twitter card meta into the exported SPA shell so shared
 * links (KakaoTalk, X, etc.) render a branded preview. Expo's web `output: single`
 * serves dist/index.html for every route, so one injection covers /u/[slug] too.
 *
 * Run after `expo export --platform web`, before deploy:
 *   node scripts/build-og.js && expo export --platform web && node scripts/inject-og.js
 */
const fs = require('fs');
const path = require('path');

const TITLE = 'footprint — 내 발자국 지도';
const DESC = '내가 다녀온 도시를 모으는 여행 지도. 빈 도시를 채워나가 보세요.';
const OG_IMAGE = 'https://footprint.expo.app/og-image.png';

const meta = `<title>${TITLE}</title>
<meta name="description" content="${DESC}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="footprint" />
<meta property="og:title" content="${TITLE}" />
<meta property="og:description" content="${DESC}" />
<meta property="og:image" content="${OG_IMAGE}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${TITLE}" />
<meta name="twitter:description" content="${DESC}" />
<meta name="twitter:image" content="${OG_IMAGE}" />
`;

const file = path.join(__dirname, '../dist/index.html');
let html = fs.readFileSync(file, 'utf8');
html = html.replace('<html lang="en">', '<html lang="ko">');
html = html.replace(/<title>.*?<\/title>\s*/i, '');
html = html.replace('</head>', `${meta}</head>`);
fs.writeFileSync(file, html);
console.log('injected OG meta into dist/index.html');
