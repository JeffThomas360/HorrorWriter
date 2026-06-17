import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicFontsDir = path.join(__dirname, '../public/fonts');

if (!fs.existsSync(publicFontsDir)) {
  fs.mkdirSync(publicFontsDir, { recursive: true });
}

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const googleFontsCssUrl = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Merriweather:ital,wght@0,300;0,400;0,700;1,300;1,400&display=swap';

async function downloadFile(url, dest) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(arrayBuffer));
  console.log(`Downloaded: ${path.basename(dest)}`);
}

async function main() {
  console.log('Fetching Google Fonts CSS...');
  const res = await fetch(googleFontsCssUrl, { headers: { 'User-Agent': userAgent } });
  if (!res.ok) throw new Error(`Failed to fetch CSS: ${res.statusText}`);
  const cssText = await res.text();

  const fontFaceRegex = /@font-face\s*\{([^}]+)\}/g;
  const urlRegex = /url\((https:\/\/[^)]+\.woff2)\)/;
  const fontFamilyRegex = /font-family:\s*['"]?([^'";]+)['"]?/;
  const fontWeightRegex = /font-weight:\s*(\d+|normal|bold)/;
  const fontStyleRegex = /font-style:\s*(\w+)/;

  let match;
  let localCss = '';

  while ((match = fontFaceRegex.exec(cssText)) !== null) {
    const fontBlock = match[1];
    
    const urlMatch = fontBlock.match(urlRegex);
    const familyMatch = fontBlock.match(fontFamilyRegex);
    const weightMatch = fontBlock.match(fontWeightRegex);
    const styleMatch = fontBlock.match(fontStyleRegex);

    if (urlMatch && familyMatch) {
      const url = urlMatch[1];
      const family = familyMatch[1];
      const weight = weightMatch ? weightMatch[1] : '400';
      const style = styleMatch ? styleMatch[1] : 'normal';

      const sanitizedFamily = family.replace(/\s+/g, '-').toLowerCase();
      const localFilename = `${sanitizedFamily}-${weight}-${style}.woff2`;
      const localPath = path.join(publicFontsDir, localFilename);

      await downloadFile(url, localPath);

      localCss += `@font-face {\n  font-family: '${family}';\n  font-style: ${style};\n  font-weight: ${weight};\n  font-display: swap;\n  src: url('/fonts/${localFilename}') format('woff2');\n}\n\n`;
    }
  }

  const outputCssPath = path.join(__dirname, '../src/styles/fonts.css');
  fs.writeFileSync(outputCssPath, localCss);
  console.log(`Successfully generated fonts CSS: ${outputCssPath}`);
}

main().catch(console.error);
