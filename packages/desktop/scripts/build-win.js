const fs = require('fs');
const path = require('path');

try {
  const nodePath = process.execPath;
  if (!fs.existsSync(nodePath)) {
    console.error(`[build-win] node.exe not found at ${nodePath}`);
    process.exit(1);
  }

  const templatePath = path.join(__dirname, '..', 'electron-builder.yml');
  const outputPath = path.join(__dirname, '..', 'electron-builder.generated.yml');

  if (!fs.existsSync(templatePath)) {
    console.error(`[build-win] template not found at ${templatePath}`);
    process.exit(1);
  }

  let content = fs.readFileSync(templatePath, 'utf8');

  if (!content.includes('__NODE_EXE_PATH__')) {
    console.error('[build-win] placeholder __NODE_EXE_PATH__ not found in electron-builder.yml');
    process.exit(1);
  }

  // Normalize to forward slashes and escape for YAML quoted string
  const normalized = nodePath.replace(/\\/g, '/');
  content = content.replace('__NODE_EXE_PATH__', normalized);

  fs.writeFileSync(outputPath, content, 'utf8');

  console.log(`[build-win] Resolved node.exe: ${nodePath}`);
  console.log(`[build-win] Generated ${outputPath}`);
  process.exit(0);
} catch (err) {
  console.error('[build-win] Failed:', err);
  process.exit(1);
}
