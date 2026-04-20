const fs = require('fs');
let code = fs.readFileSync('jewelry-data.js', 'utf8');

// 1. Remove the old IDs (157, 159, 162, 163)
const oldIds = ['n_tryon_157', 'n_tryon_159', 'n_tryon_162', 'n_tryon_163'];
oldIds.forEach(id => {
  const regex = new RegExp(`\\s+\\{\\s+id:\\s*'${id}'[\\s\\S]*?\\},`, 'g');
  code = code.replace(regex, '');
});

// 2. Add the new ones (112, 113, 115, 116)
const newItems = `
  {
    id: 'n_tryon_112',
    name: 'Antique Gold Choker',
    category: 'necklace',
    type: 'necklace',
    glbFile: 'necklace14.glb',
    image: 'static/images/necklace/necklace112.png',
    color: '#d4a847',
    gemColor: null,
    metalness: 0.95,
    roughness: 0.1,
    price: 'Rs. 255,000',
    rating: 4.8,
    ratingCount: 15,
    material: '22K Gold',
    description: 'A beautiful antique gold choker for Try-On.',
    tags: ['antique', 'gold', 'choker'],
  },
  {
    id: 'n_tryon_113',
    name: 'Designer Emerald Piece',
    category: 'necklace',
    type: 'necklace',
    glbFile: 'necklace15.glb',
    image: 'static/images/necklace/necklace113.png',
    color: '#d4a847',
    gemColor: '#2d8a4e',
    metalness: 0.93,
    roughness: 0.08,
    price: 'Rs. 310,000',
    rating: 4.9,
    ratingCount: 22,
    material: '22K Gold + Emeralds',
    description: 'Exquisite designer necklace with emerald accents.',
    tags: ['emerald', 'designer', 'gold'],
  },
  {
    id: 'n_tryon_115',
    name: 'Royal Ruby Collar',
    category: 'necklace',
    type: 'necklace',
    glbFile: 'necklace12.glb',
    image: 'static/images/necklace/necklace115.png',
    color: '#d4a847',
    gemColor: '#cc2233',
    metalness: 0.95,
    roughness: 0.06,
    price: 'Rs. 420,000',
    rating: 5.0,
    ratingCount: 11,
    material: '22K Gold + Rubies',
    description: 'Stunning royal collar necklace featuring rubies.',
    tags: ['ruby', 'royal', 'gold'],
  },
  {
    id: 'n_tryon_116',
    name: 'Grand Temple Necklace',
    category: 'necklace',
    type: 'necklace',
    glbFile: 'necklace45.glb',
    image: 'static/images/necklace/necklace116.png',
    color: '#d4a847',
    gemColor: null,
    metalness: 0.94,
    roughness: 0.12,
    price: 'Rs. 380,000',
    rating: 4.9,
    ratingCount: 28,
    material: '22K Gold',
    description: 'Traditional temple-style necklace for Try-On.',
    tags: ['temple', 'traditional', 'gold'],
  },
`;

// Insert the new ones before RINGS
const replaceTarget = '// ── RINGS ─────────────────────────────────────────────────────';
if (code.includes(replaceTarget)) {
  code = code.replace(replaceTarget, newItems + replaceTarget);
}

fs.writeFileSync('jewelry-data.js', code);
console.log('Successfully updated necklace entries.');
