const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const svgPath = path.join(__dirname, '..', 'icons', 'solely.svg');
const pngPath = path.join(__dirname, '..', 'icons', 'solely.png');

async function convert() {
    const svgBuffer = fs.readFileSync(svgPath);
    await sharp(svgBuffer)
        .resize(128, 128)
        .png()
        .toFile(pngPath);
    console.log('Icon converted: icons/solely.png (128x128)');
}

convert().catch((err) => {
    console.error('Icon conversion failed:', err.message);
    process.exit(1);
});